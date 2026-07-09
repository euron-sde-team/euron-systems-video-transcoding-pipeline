import path from "path";
import config from "../config";
import { run } from "./exec";
import type { Rung } from "./ladder";

/**
 * Shared, config-driven video-encode args for the processed download (capped-CRF
 * H.264 by default; HEVC opt-in). Used by both the source-encode path (the active
 * decoupled DOWNLOAD job) and the retained rung-remux path below.
 */
const downloadVideoArgs = (): string[] => {
  const codec = config.DOWNLOAD_VIDEO_CODEC;
  const isHevc = codec === "libx265" || codec === "hevc";
  const args = ["-c:v", codec, "-crf", config.DOWNLOAD_CRF, "-preset", config.DOWNLOAD_PRESET];
  // Optional rate cap → "capped CRF": keep CRF quality but never exceed the cap, so
  // the size reduction is deterministic even on complex content (bufsize = 2x cap).
  // Set DOWNLOAD_MAXRATE_KBPS=0 for pure CRF (e.g. when using HEVC).
  if (config.DOWNLOAD_MAXRATE_KBPS > 0) {
    args.push(
      "-maxrate",
      `${config.DOWNLOAD_MAXRATE_KBPS}k`,
      "-bufsize",
      `${config.DOWNLOAD_MAXRATE_KBPS * 2}k`
    );
  }
  // `-tag:v hvc1` makes HEVC play on Apple (QuickTime/Safari/iOS); Apple rejects
  // the default `hev1` tag. For H.264 use the broadly-compatible high profile.
  if (isHevc) args.push("-tag:v", "hvc1");
  else args.push("-profile:v", "high");
  args.push("-pix_fmt", "yuv420p");
  return args;
};

/**
 * Produce the downloadable MP4 by re-encoding straight from the SOURCE, scaling to
 * the top rung's dimensions. This is the ACTIVE path for the decoupled DOWNLOAD
 * job: the streaming rungs live on R2 (as AES-TS), not on this worker, so the job
 * re-downloads the source and encodes from it rather than remuxing a local rung.
 *
 * A SIMPLE -vf filtergraph autorotates the input (unlike the complex-filtergraph
 * ladder in ffmpeg.ts), so passing the top rung's aspect-preserving scale filter
 * yields correctly-oriented output with no explicit transpose. Audio is a fresh
 * 128k AAC encode from the source (the extracted rung audio is not local here).
 *
 * Returns the local path of the encoded file. The caller uploads it to the PRIVATE
 * downloads bucket (unencrypted full video; must never hit the public CDN).
 */
export const encodeDownloadFromSource = async (
  inputPath: string,
  workDir: string,
  scaleFilter: string,
  hasAudio: boolean,
  durationSec = 0,
  signal?: AbortSignal
): Promise<string> => {
  const outPath = path.join(workDir, "processed.mp4");
  const args = ["-y", "-i", inputPath, "-vf", scaleFilter, "-map", "0:v:0"];
  if (hasAudio) args.push("-map", "0:a:0");
  args.push(...downloadVideoArgs());
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  if (durationSec > 0) args.push("-t", String(durationSec));
  args.push("-movflags", "+faststart", outPath);

  await run(config.FFMPEG_BIN, args, "download-from-source", { signal });
  return outPath;
};

/**
 * NOT IN USE (async-decoupling migration): retained rung-remux download path. The
 * PRIMARY transcode no longer produces the download inline; the decoupled DOWNLOAD
 * job calls encodeDownloadFromSource() above instead (the local rungs are not
 * available to a separate background worker). Kept for a future same-worker path.
 *
 * Re-encodes the top encoded rung's video at a size-conscious target and COPIES the
 * shared AAC audio into one faststart MP4. We re-encoded the RUNG (not the source)
 * because it was already display-correct (rotation/scale/yuv420p applied), so no
 * filtering was needed and there was no risk of sideways/wrong-AR output.
 */
export const muxProcessedDownload = async (
  videoFiles: { rung: Rung; file: string }[],
  audioFile: string | null,
  workDir: string
): Promise<string | null> => {
  if (videoFiles.length === 0) return null;

  // Highest-resolution rung (the ladder is ordered high→low, but pick by area to
  // be robust to ordering changes).
  const top = videoFiles.reduce((best, cur) =>
    cur.rung.width * cur.rung.height > best.rung.width * best.rung.height ? cur : best
  );

  const outPath = path.join(workDir, "processed.mp4");
  const args = ["-y", "-i", top.file];
  if (audioFile) args.push("-i", audioFile);
  args.push("-map", "0:v:0");
  if (audioFile) args.push("-map", "1:a:0");
  args.push(...downloadVideoArgs());
  // Audio: copy the already-small shared 128k AAC as-is (no re-encode, no loss).
  if (audioFile) args.push("-c:a", "copy");
  args.push("-movflags", "+faststart", outPath);

  await run(config.FFMPEG_BIN, args, "download-mux");
  return outPath;
};
