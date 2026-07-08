import config from "../config";
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
// Ladder trimmed to 1080/720/480 (240p + 360p dropped): the low rungs cost storage
// and egress for little benefit on modern connections. 480 is the floor.
const LANDSCAPE: Rung[] = [
  { name: "1080", width: 1920, height: 1080, scaleFilter: "scale=-2:1080", videoKbps: 5000, maxrateKbps: 5350, bufsizeKbps: 7500 },
  { name: "720", width: 1280, height: 720, scaleFilter: "scale=-2:720", videoKbps: 3000, maxrateKbps: 3210, bufsizeKbps: 4500 },
  { name: "480", width: 854, height: 480, scaleFilter: "scale=-2:480", videoKbps: 1400, maxrateKbps: 1500, bufsizeKbps: 2100 },
];

// §13, 9:16 vertical / reels. scale=W:-2 (fix width, auto even height).
// Trimmed to 1080/720/540 (240 + 360 dropped); 540 is the natural 9:16 mid/floor rung.
const VERTICAL: Rung[] = [
  { name: "1080", width: 1080, height: 1920, scaleFilter: "scale=1080:-2", videoKbps: 5000, maxrateKbps: 5350, bufsizeKbps: 7500 },
  { name: "720", width: 720, height: 1280, scaleFilter: "scale=720:-2", videoKbps: 3000, maxrateKbps: 3210, bufsizeKbps: 4500 },
  { name: "540", width: 540, height: 960, scaleFilter: "scale=540:-2", videoKbps: 1600, maxrateKbps: 1700, bufsizeKbps: 2400 },
];

/**
 * Pick the ladder by orientation, then drop rungs that would UPSCALE the source
 * (wasted compute + R2 egress, lower quality than source). Always keeps at least
 * the floor rung so even a tiny source produces one playable rendition.
 */
export const selectLadder = (
  orientation: Orientation,
  srcWidth: number,
  srcHeight: number,
  sourceBitrateKbps = 0
): Rung[] => {
  const table = orientation === "portrait" ? VERTICAL : LANDSCAPE;
  const sourceLimit = orientation === "portrait" ? srcWidth : srcHeight;
  const limitOf = (r: Rung) => (orientation === "portrait" ? r.width : r.height);

  const fit = table.filter((r) => limitOf(r) <= sourceLimit);
  const rungs = fit.length > 0 ? fit : [table[table.length - 1] as Rung];
  return capToSource(rungs, sourceBitrateKbps);
};

/**
 * Cap each rung's bitrate to the source bitrate (× CAP_TO_SOURCE_FACTOR) so a
 * low-bitrate source is not encoded at the fixed ladder targets. Never RAISES a
 * rung, so a rung already below the cap is byte-for-byte unchanged; only rungs
 * above the cap are lowered (maxrate/bufsize kept proportional). Deterministic in
 * (rungs, sourceBitrateKbps), so the PRIMARY transcode and the decoupled CAPTIONS
 * master rebuild compute an identical ladder. No-op when disabled or bitrate=0.
 */
const capToSource = (rungs: Rung[], sourceBitrateKbps: number): Rung[] => {
  if (!config.CAP_TO_SOURCE || sourceBitrateKbps <= 0) return rungs;
  const cap = Math.round(sourceBitrateKbps * config.CAP_TO_SOURCE_FACTOR);
  return rungs.map((r) => {
    if (r.videoKbps <= cap) return r;
    return {
      ...r,
      videoKbps: cap,
      maxrateKbps: Math.round(cap * 1.07),
      bufsizeKbps: Math.round(cap * 1.5),
    };
  });
};
