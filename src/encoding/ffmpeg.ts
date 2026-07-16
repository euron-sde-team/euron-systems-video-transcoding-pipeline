import path from "path";
import config from "../config";
import { run } from "./exec";
import type { Rung } from "./ladder";

export interface TranscodeResult {
  /** Per-rung mp4 file paths, keyed by rung name. */
  videoFiles: { rung: Rung; file: string }[];
  /** Extracted AAC audio file path, or null if the source had no audio. */
  audioFile: string | null;
}

/**
 * ONE FFmpeg process: decode once, split, encode every rung + extract audio.
 *
 * Why a single process (constraint #3): spawning one ffmpeg per rung decodes the
 * source N times, wasting the 4 vCPUs. `split=N` fans the decoded frames into N
 * scale chains so we decode exactly once.
 *
 * Why -force_key_frames expr (constraint #2): every rung gets IDR frames at the
 * SAME timestamps (every 4s, frame-rate independent). Without aligned keyframes
 * ABR switching tears and the packager can't cut clean, switchable segments.
 * `-g`/`-keyint_min` are frame-count based and drift across rungs, do not use.
 *
 * Why the fps floor (sourceFps): a near-static / VFR source (slide deck + voiceover)
 * carries an effective rate well under 1 fps. Passed through, the HLS output holds
 * ~1 video frame per segment with avg_frame_rate=0/0, which hls.js/MSE cannot play
 * (fatal MEDIA_ERROR -> "Playback failed"). When sourceFps is unknown (0) or below
 * MIN_OUTPUT_FPS we inject one `fps` filter BEFORE the split so every rung inherits
 * an identical constant-rate timeline (duplicated static frames). Sources at/above
 * the floor get no fps filter, so their command stays byte-for-byte legacy.
 */
export const transcode = async (
  inputPath: string,
  workDir: string,
  rungs: Rung[],
  hasAudio: boolean,
  rotation = 0,
  durationSec = 0,
  sourceFps = 0,
  signal?: AbortSignal
): Promise<TranscodeResult> => {
  // Clockwise display rotation, applied BEFORE the split so every rung inherits
  // it from the single decode. ffmpeg does NOT autorotate complex-filtergraph
  // inputs (only simple -vf / direct outputs), so we rotate explicitly; the
  // matching -noautorotate below forces [0:v] to coded frames on every ffmpeg
  // build, so this transpose is the sole rotation (never a double-rotate).
  // rotation=0 leaves the command byte-for-byte identical to the legacy path.
  const rotFilter =
    rotation === 90
      ? "transpose=1" // 90deg clockwise
      : rotation === 270
        ? "transpose=2" // 90deg counter-clockwise
        : rotation === 180
          ? "transpose=1,transpose=1"
          : null;

  // Trigger CFR normalisation ONLY for a near-static / unusable-fps source (a slide
  // deck at ~0.14 fps -- the case that breaks MSE with ~1 frame per segment). The
  // trigger floor is deliberately BELOW every real capture/broadcast rate (15 /
  // 23.976 / 24 / 25 / 30 / 60), so a NORMAL video is NEVER resampled and keeps the
  // byte-for-byte legacy command; only genuinely near-static sources are lifted to
  // MIN_OUTPUT_FPS. CFR is enforced with a per-output `-r` (see the encode args
  // below), NOT an `fps` filter before the split: a pre-split `fps` feeding split's
  // two consumers (720 + 480) at different drain rates on a VFR source made ffmpeg
  // emit uninitialised gray (128) frames and stall the encode. `-r` duplicates
  // frames per output stream after the split, so the split only buffers the sparse
  // source frames.
  const NEAR_STATIC_FPS = 10;
  const forceCfr = sourceFps <= 0 || sourceFps < NEAR_STATIC_FPS;

  // Build: [0:v]{rot,}split=N[s0][s1]...; [s0]scale..[v0]; [s1]scale..[v1]; ...
  const preSplit = rotFilter;
  const splitLabels = rungs.map((_, i) => `[s${i}]`).join("");
  const splitChain = `[0:v]${preSplit ? `${preSplit},` : ""}split=${rungs.length}${splitLabels}`;
  const scaleChains = rungs.map((r, i) => `[s${i}]${r.scaleFilter}[v${i}]`);
  const filterComplex = [splitChain, ...scaleChains].join(";");

  const args: string[] = ["-y"];
  if (rotFilter) args.push("-noautorotate"); // input option: must precede -i
  args.push("-i", inputPath, "-filter_complex", filterComplex);

  // Defensive: bound every output to the probed source duration so a filter graph
  // that fails to propagate EOF can't run away. NOTE this is NOT the fix for the
  // bogus ~2^32 s DASH duration, that was Shaka Packager emitting a LIVE
  // (type="dynamic") MPD; the cure is --generate_static_live_mpd in encoding/shaka.ts.
  // For a normal source -t equals the real duration, so it's a no-op. Skipped (=0)
  // only if the probe could not determine a duration.
  const durationArgs = durationSec > 0 ? ["-t", String(durationSec)] : [];

  const videoFiles: { rung: Rung; file: string }[] = [];
  rungs.forEach((rung, i) => {
    const file = path.join(workDir, `v_${rung.name}.mp4`);
    videoFiles.push({ rung, file });
    args.push(
      "-map", `[v${i}]`,
      // Per-output CFR: duplicate frames to MIN_OUTPUT_FPS for a near-static/VFR
      // source (avoids the pre-split fps-filter gray bug; see above). Omitted for
      // normal sources so their rate + command stay byte-for-byte legacy.
      ...(forceCfr ? ["-r", String(config.MIN_OUTPUT_FPS)] : []),
      "-c:v", "libx264",
      "-b:v", `${rung.videoKbps}k`,
      "-maxrate", `${rung.maxrateKbps}k`,
      "-bufsize", `${rung.bufsizeKbps}k`,
      "-preset", config.LADDER_PRESET,
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-threads", "0",
      "-force_key_frames", "expr:gte(t,n_forced*4)",
      "-an",
      ...durationArgs,
      "-movflags", "+faststart",
      file
    );
  });

  let audioFile: string | null = null;
  if (hasAudio) {
    audioFile = path.join(workDir, "audio.mp4");
    args.push(
      "-map", "0:a:0",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-vn",
      ...durationArgs,
      audioFile
    );
  }

  await run(config.FFMPEG_BIN, args, "ffmpeg-transcode", { signal });
  return { videoFiles, audioFile };
};
