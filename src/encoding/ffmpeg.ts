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
 */
export const transcode = async (
  inputPath: string,
  workDir: string,
  rungs: Rung[],
  hasAudio: boolean
): Promise<TranscodeResult> => {
  // Build: [0:v]split=N[s0][s1]...; [s0]scale..[v0]; [s1]scale..[v1]; ...
  const splitLabels = rungs.map((_, i) => `[s${i}]`).join("");
  const splitChain = `[0:v]split=${rungs.length}${splitLabels}`;
  const scaleChains = rungs.map((r, i) => `[s${i}]${r.scaleFilter}[v${i}]`);
  const filterComplex = [splitChain, ...scaleChains].join(";");

  const args: string[] = ["-y", "-i", inputPath, "-filter_complex", filterComplex];

  const videoFiles: { rung: Rung; file: string }[] = [];
  rungs.forEach((rung, i) => {
    const file = path.join(workDir, `v_${rung.name}.mp4`);
    videoFiles.push({ rung, file });
    args.push(
      "-map", `[v${i}]`,
      "-c:v", "libx264",
      "-b:v", `${rung.videoKbps}k`,
      "-maxrate", `${rung.maxrateKbps}k`,
      "-bufsize", `${rung.bufsizeKbps}k`,
      "-preset", "medium",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-threads", "0",
      "-force_key_frames", "expr:gte(t,n_forced*4)",
      "-an",
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
      audioFile
    );
  }

  await run(config.FFMPEG_BIN, args, "ffmpeg-transcode");
  return { videoFiles, audioFile };
};
