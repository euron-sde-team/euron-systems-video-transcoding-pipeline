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
 * Returns null when the source has no audio. Caption generation is ENTIRELY
 * non-fatal: any failure (the WAV extraction OR whisper) is logged and yields
 * null, because a video without captions is still a valid 'ready' result. Both
 * steps live inside the try, so an audio-decode hiccup can never fail the job.
 */
export const generateCaptions = async (
  inputPath: string,
  workDir: string,
  hasAudio: boolean
): Promise<CaptionsResult | null> => {
  if (!hasAudio) return null;

  const wavPath = path.join(workDir, "audio16k.wav");
  const outPrefix = path.join(workDir, "en"); // whisper.cpp appends .vtt
  const vttFile = `${outPrefix}.vtt`;

  try {
    // 1. extract 16 kHz mono PCM WAV (inside the try: a decode failure here is
    //    non-fatal, captions are optional and must never sink the whole job).
    await run(
      config.FFMPEG_BIN,
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath],
      "ffmpeg-wav"
    );
    // 2. transcribe → en.vtt.
    await run(
      config.WHISPER_BIN,
      ["-m", config.WHISPER_MODEL, "-f", wavPath, "-ovtt", "-of", outPrefix],
      "whisper"
    );
    await access(vttFile);
    return { vttFile, lang: "en" };
  } catch (err) {
    logger.warn(`[captions] generation failed (non-fatal): ${(err as Error).message}`);
    return null;
  }
};
