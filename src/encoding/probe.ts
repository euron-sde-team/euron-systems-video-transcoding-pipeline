import config from "../config";
import { run } from "./exec";

export type Orientation = "landscape" | "portrait" | "square";

export interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
  orientation: Orientation;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

const classify = (w: number, h: number): Orientation => {
  if (w === h) return "square";
  return w > h ? "landscape" : "portrait";
};

/**
 * ffprobe the source for dimensions + duration. Orientation picks the ladder
 * (landscape vs vertical) and the player layout. Square is treated as landscape
 * downstream but recorded distinctly.
 */
export const probe = async (inputPath: string): Promise<ProbeResult> => {
  const { stdout } = await run(
    config.FFPROBE_BIN,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      inputPath,
    ],
    "ffprobe"
  );

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const video = (parsed.streams ?? []).find((s) => s.codec_type === "video");
  if (!video?.width || !video?.height) {
    throw new Error("ffprobe: no video stream / dimensions found");
  }
  const width = video.width;
  const height = video.height;
  const durationSec = Math.max(0, Math.round(Number(parsed.format?.duration ?? 0)));
  const hasAudio = (parsed.streams ?? []).some((s) => s.codec_type === "audio");

  return { width, height, durationSec, orientation: classify(width, height), hasAudio };
};
