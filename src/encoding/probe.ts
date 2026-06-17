import config from "../config";
import { run } from "./exec";

export type Orientation = "landscape" | "portrait" | "square";

export interface ProbeResult {
  /** DISPLAY width (after rotation), drives orientation + the ABR ladder. */
  width: number;
  /** DISPLAY height (after rotation). */
  height: number;
  durationSec: number;
  orientation: Orientation;
  hasAudio: boolean;
  /**
   * Clockwise rotation (0/90/180/270) the transcode must apply for correct
   * display. ffmpeg does NOT autorotate complex-filtergraph inputs, so the
   * worker rotates explicitly using this value (see encoding/ffmpeg.ts).
   */
  rotation: number;
}

interface FfprobeSideData {
  side_data_type?: string;
  rotation?: number;
}
interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: FfprobeSideData[];
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
 * Clockwise display rotation in {0,90,180,270}, replicating ffmpeg's own
 * autorotate so the explicitly-rotated renditions match the natively-rotated
 * thumbnails (simple -vf filtergraphs DO autorotate). ffmpeg derives
 * theta = -round(displayMatrixRotation); ffprobe reports that rotation in
 * side_data_list[].rotation. The legacy `tags.rotate` is already the clockwise
 * display angle (rotate=90 == matrix rotation -90), so it maps directly.
 * Prefer the modern Display Matrix; fall back to the legacy tag.
 */
const displayRotation = (stream: FfprobeStream): number => {
  const norm = (deg: number): number => (((Math.round(deg) % 360) + 360) % 360);
  const snap = (theta: number): number =>
    theta === 90 || theta === 180 || theta === 270 ? theta : 0;

  const dm = (stream.side_data_list ?? []).find((s) => s.side_data_type === "Display Matrix");
  if (dm && typeof dm.rotation === "number") {
    return snap(norm(-dm.rotation));
  }
  const tag = stream.tags?.rotate;
  if (tag !== undefined && tag !== "") {
    return snap(norm(Number(tag)));
  }
  return 0;
};

/**
 * ffprobe the source for dimensions + duration + rotation. Orientation picks
 * the ladder (landscape vs vertical) and the player layout; rotation tells the
 * transcoder how to orient the output. Square is treated as landscape
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

  const rotation = displayRotation(video);
  // A 90/270 rotation swaps the displayed dimensions vs the coded ones; 0/180
  // leave them as-is. Downstream (classify + ladder + scale filters) all work
  // off these display dimensions, matching the rotated frames the transcoder
  // produces.
  const swap = rotation === 90 || rotation === 270;
  const width = swap ? video.height : video.width;
  const height = swap ? video.width : video.height;

  const durationSec = Math.max(0, Math.round(Number(parsed.format?.duration ?? 0)));
  const hasAudio = (parsed.streams ?? []).some((s) => s.codec_type === "audio");

  return { width, height, durationSec, orientation: classify(width, height), hasAudio, rotation };
};
