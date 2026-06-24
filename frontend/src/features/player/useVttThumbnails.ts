import { useEffect, useState } from "react";

/**
 * A single scrub-thumbnail tile: one region of a sprite sheet covering a time
 * range. Shape-compatible with the subset of Shaka's getThumbnails() result that
 * ThumbnailPreview renders, so both the Shaka path and this native-VTT path feed
 * the exact same sprite renderer.
 */
export interface ThumbTile {
  startTime: number;
  duration: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  /** Absolute sprite-sheet URL (the #xywh fragment is irrelevant; geometry is above). */
  uris: string[];
}

/** Parse "HH:MM:SS.mmm" or "MM:SS.mmm" into seconds; null if malformed. */
function parseVttTime(s: string): number | null {
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return null;
  return parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
}

/**
 * Parse a sprite-sheet WebVTT (the same `thumbnails.vtt` Shaka consumes via
 * addThumbnailsTrack) into tiles. Each cue is a `start --> end` line followed by
 * `sprite_NNN.jpg#xywh=x,y,w,h`. Sprite paths are relative to the .vtt, so we
 * resolve them against `baseUrl` (must be absolute).
 */
export function parseThumbnailVtt(vtt: string, baseUrl: string): ThumbTile[] {
  const tiles: ThumbTile[] = [];
  const lines = vtt.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const arrow = lines[i].indexOf("-->");
    if (arrow === -1) continue;
    const start = parseVttTime(lines[i].slice(0, arrow).trim());
    const end = parseVttTime(lines[i].slice(arrow + 3).trim().split(/\s+/)[0]);
    if (start == null || end == null) continue;

    // Cue payload is the next non-empty line.
    let payload = "";
    for (let j = i + 1; j < lines.length; j++) {
      const p = lines[j].trim();
      if (p) {
        payload = p;
        break;
      }
    }
    const hash = payload.indexOf("#xywh=");
    if (hash === -1) continue;
    const [x, y, w, h] = payload
      .slice(hash + "#xywh=".length)
      .split(",")
      .map(Number);
    if ([x, y, w, h].some((n) => Number.isNaN(n))) continue;

    tiles.push({
      startTime: start,
      duration: Math.max(0, end - start),
      positionX: x,
      positionY: y,
      width: w,
      height: h,
      uris: [new URL(payload.slice(0, hash), baseUrl).href],
    });
  }
  return tiles;
}

/** The tile covering `time`; clamps to the last tile past the final cue. */
export function thumbAtTime(tiles: ThumbTile[], time: number): ThumbTile | null {
  for (const t of tiles) {
    if (time >= t.startTime && time < t.startTime + t.duration) return t;
  }
  return tiles.length ? tiles[tiles.length - 1] : null;
}

/**
 * Fetch + parse a sprite-sheet WebVTT once, for the native (Safari/iOS) path
 * where there is no Shaka player to call getThumbnails(). Pass `null` to disable
 * (e.g. on the Shaka path, which already has its own thumbnail source).
 */
export function useVttThumbnails(url: string | null): ThumbTile[] | null {
  const [tiles, setTiles] = useState<ThumbTile[] | null>(null);

  useEffect(() => {
    if (!url) {
      setTiles(null);
      return;
    }
    const abs = new URL(url, window.location.href).href;
    let cancelled = false;
    fetch(abs)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`thumbnails.vtt ${r.status}`))))
      .then((text) => {
        if (!cancelled) setTiles(parseThumbnailVtt(text, abs));
      })
      .catch(() => {
        if (!cancelled) setTiles(null); // best-effort: previews just won't show
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return tiles;
}
