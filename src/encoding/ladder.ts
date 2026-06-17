import type { Orientation } from "./probe";

export interface Rung {
  /** Label used for the output dir + manifest (e.g. "1080", "720"). */
  name: string;
  width: number;
  height: number;
  /** ffmpeg scale filter applied to this rung's split output. Aspect-preserving via -2. */
  scaleFilter: string;
  videoKbps: number;
  maxrateKbps: number;
  bufsizeKbps: number;
}

// §13, 16:9 landscape. scale=-2:H (fix height, auto even width).
const LANDSCAPE: Rung[] = [
  { name: "1080", width: 1920, height: 1080, scaleFilter: "scale=-2:1080", videoKbps: 5000, maxrateKbps: 5350, bufsizeKbps: 7500 },
  { name: "720", width: 1280, height: 720, scaleFilter: "scale=-2:720", videoKbps: 3000, maxrateKbps: 3210, bufsizeKbps: 4500 },
  { name: "480", width: 854, height: 480, scaleFilter: "scale=-2:480", videoKbps: 1400, maxrateKbps: 1500, bufsizeKbps: 2100 },
  { name: "360", width: 640, height: 360, scaleFilter: "scale=-2:360", videoKbps: 800, maxrateKbps: 856, bufsizeKbps: 1200 },
  { name: "240", width: 426, height: 240, scaleFilter: "scale=-2:240", videoKbps: 350, maxrateKbps: 400, bufsizeKbps: 600 },
];

// §13, 9:16 vertical / reels. scale=W:-2 (fix width, auto even height).
const VERTICAL: Rung[] = [
  { name: "1080", width: 1080, height: 1920, scaleFilter: "scale=1080:-2", videoKbps: 5000, maxrateKbps: 5350, bufsizeKbps: 7500 },
  { name: "720", width: 720, height: 1280, scaleFilter: "scale=720:-2", videoKbps: 3000, maxrateKbps: 3210, bufsizeKbps: 4500 },
  { name: "540", width: 540, height: 960, scaleFilter: "scale=540:-2", videoKbps: 1600, maxrateKbps: 1700, bufsizeKbps: 2400 },
  { name: "360", width: 360, height: 640, scaleFilter: "scale=360:-2", videoKbps: 800, maxrateKbps: 856, bufsizeKbps: 1200 },
  { name: "240", width: 240, height: 426, scaleFilter: "scale=240:-2", videoKbps: 350, maxrateKbps: 400, bufsizeKbps: 600 },
];

/**
 * Pick the ladder by orientation, then drop rungs that would UPSCALE the source
 * (wasted compute + R2 egress, lower quality than source). Always keeps at least
 * the floor rung so even a tiny source produces one playable rendition.
 */
export const selectLadder = (
  orientation: Orientation,
  srcWidth: number,
  srcHeight: number
): Rung[] => {
  const table = orientation === "portrait" ? VERTICAL : LANDSCAPE;
  const sourceLimit = orientation === "portrait" ? srcWidth : srcHeight;
  const limitOf = (r: Rung) => (orientation === "portrait" ? r.width : r.height);

  const fit = table.filter((r) => limitOf(r) <= sourceLimit);
  return fit.length > 0 ? fit : [table[table.length - 1] as Rung];
};
