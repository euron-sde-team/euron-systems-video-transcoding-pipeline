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
 * Generate captions on the worker with whisper.cpp.
 *   1. ffmpeg extracts 16 kHz mono PCM WAV (what whisper expects).
 *   2. whisper.cpp transcribes → <lang>.vtt.
 * The language is FORCED (`-l <lang>`), defaulting to English, so transcription is
 * deterministic instead of relying on whisper's auto-detect.
 *
 * Returns null when the source has no audio. Caption generation is ENTIRELY
 * non-fatal: any failure (the WAV extraction OR whisper) yields null, because a
 * video without captions is still a valid 'ready' result. Both steps live inside
 * the try, so an audio-decode hiccup can never fail the job. The failure is logged
 * at ERROR with the underlying stderr (NOT a quiet warn) so a missing whisper model
 * or renamed binary on the worker AMI is actually visible, not silently swallowed.
 */
export const generateCaptions = async (
  inputPath: string,
  workDir: string,
  hasAudio: boolean,
  lang: string = config.CAPTIONS_DEFAULT_LANG,
  signal?: AbortSignal
): Promise<CaptionsResult | null> => {
  if (!hasAudio) return null;

  const wavPath = path.join(workDir, "audio16k.wav");
  const outPrefix = path.join(workDir, lang); // whisper.cpp appends .vtt
  const vttFile = `${outPrefix}.vtt`;

  try {
    // 1. extract 16 kHz mono PCM WAV (inside the try: a decode failure here is
    //    non-fatal, captions are optional and must never sink the whole job).
    await run(
      config.FFMPEG_BIN,
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath],
      "ffmpeg-wav",
      { signal }
    );
    // 2. transcribe → <lang>.vtt. `-l <lang>` forces the language (default English).
    await run(
      config.WHISPER_BIN,
      ["-m", config.WHISPER_MODEL, "-l", lang, "-f", wavPath, "-ovtt", "-of", outPrefix],
      "whisper",
      { signal }
    );
    await access(vttFile);
    return { vttFile, lang };
  } catch (err) {
    // ERROR, not warn: a swallowed warn is exactly why captions silently never
    // generated. Surface the real cause (e.g. missing model / binary) loudly.
    logger.error(`[captions] generation failed (non-fatal, video still ready): ${(err as Error).message}`);
    return null;
  }
};
