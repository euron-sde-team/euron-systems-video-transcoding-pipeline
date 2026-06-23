import path from "path";
import config from "../config";
import { run } from "./exec";
import type { Rung } from "./ladder";

/**
 * Produce a single web-optimized, downloadable MP4 (the YouTube-style "processed
 * download" for the uploader). It REMUXES (`-c copy`) the top encoded rung's video
 * with the shared audio into one faststart MP4, no re-encode. The top rung is
 * already efficient H.264 high, so the result is markedly smaller than a typical
 * phone original while staying high-resolution.
 *
 * Returns the local path of the muxed file. The caller uploads it to the PRIVATE
 * upload bucket (it is unencrypted full video; it must never hit the public CDN).
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
  args.push("-c", "copy", "-movflags", "+faststart", outPath);

  await run(config.FFMPEG_BIN, args, "download-mux");
  return outPath;
};
