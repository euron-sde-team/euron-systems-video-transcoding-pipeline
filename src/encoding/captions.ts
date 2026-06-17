import { access } from "fs/promises";
import path from "path";
import config from "../config";
import logger from "../utils/logger";
import { run } from "./exec";

export interface CaptionsResult {
  vttFile: string;
  lang: string;
}

/**
 * Generate English captions on the worker with whisper.cpp.
 *   1. ffmpeg extracts 16 kHz mono PCM WAV (what whisper expects).
 *   2. whisper.cpp transcribes → en.vtt.
 * Returns null when the source has no audio. Whisper failure is non-fatal: a
 * video without captions is still a valid 'ready' result, so the pipeline logs
 * and continues rather than failing the whole job.
 */
export const generateCaptions = async (
  inputPath: string,
  workDir: string,
  hasAudio: boolean
): Promise<CaptionsResult | null> => {
  if (!hasAudio) return null;

  const wavPath = path.join(workDir, "audio16k.wav");
  await run(
    config.FFMPEG_BIN,
    ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath],
    "ffmpeg-wav"
  );

  const outPrefix = path.join(workDir, "en"); // whisper.cpp appends .vtt
  const vttFile = `${outPrefix}.vtt`;

  try {
    await run(
      config.WHISPER_BIN,
      ["-m", config.WHISPER_MODEL, "-f", wavPath, "-ovtt", "-of", outPrefix],
      "whisper"
    );
    await access(vttFile);
    return { vttFile, lang: "en" };
  } catch (err) {
    logger.warn(`[captions] whisper failed (non-fatal): ${(err as Error).message}`);
    return null;
  }
};
