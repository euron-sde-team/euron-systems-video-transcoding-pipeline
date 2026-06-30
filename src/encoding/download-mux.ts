import path from "path";
import config from "../config";
import { run } from "./exec";
import type { Rung } from "./ladder";

/**
 * Produce a single web-optimized, downloadable MP4 (the YouTube-style "processed
 * download" for the uploader). It RE-ENCODES the top encoded rung's video at a
 * size-conscious quality target (config.DOWNLOAD_VIDEO_CODEC / DOWNLOAD_CRF /
 * DOWNLOAD_PRESET; HEVC CRF 28 by default) and COPIES the shared AAC audio into
 * one faststart MP4.
 *
 * Why re-encode (not `-c copy`): the top rung is the STREAMING rung, fixed at
 * ~5 Mbps regardless of the source's bitrate, so copying it verbatim produced
 * multi-GB downloads (a 600 MB upload → 2.36 GB). A CRF re-encode decouples the
 * download from the ladder and roughly thirds the size at near-identical quality.
 * We re-encode the RUNG (not the original source) on purpose: it is already
 * display-correct (rotation/scale/yuv420p applied during transcode), so no
 * filtering is needed and there is no risk of sideways/wrong-AR output.
 *
 * Returns the local path of the encoded file. The caller uploads it to the
 * PRIVATE downloads bucket (unencrypted full video; it must never hit the
 * public CDN). This step is best-effort (non-fatal) in the pipeline.
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

  const codec = config.DOWNLOAD_VIDEO_CODEC;
  const isHevc = codec === "libx265" || codec === "hevc";

  const outPath = path.join(workDir, "processed.mp4");
  const args = ["-y", "-i", top.file];
  if (audioFile) args.push("-i", audioFile);
  args.push("-map", "0:v:0");
  if (audioFile) args.push("-map", "1:a:0");

  // Video: size-conscious CRF re-encode (NOT a copy of the streaming rung).
  args.push("-c:v", codec, "-crf", config.DOWNLOAD_CRF, "-preset", config.DOWNLOAD_PRESET);
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

  // Audio: copy the already-small shared 128k AAC as-is (no re-encode, no loss).
  if (audioFile) args.push("-c:a", "copy");

  args.push("-movflags", "+faststart", outPath);

  await run(config.FFMPEG_BIN, args, "download-mux");
  return outPath;
};
