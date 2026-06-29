import { useEffect, useRef, useState } from "react";
import { formatTime } from "../../lib/format";
import { type ThumbTile, thumbAtTime } from "./useVttThumbnails";

const PREVIEW_WIDTH = 160; // px

// Natural sprite-sheet dimensions, cached per sheet URL. The thumbnails.vtt does
// not declare the sheet size, so we measure it once and reuse it for every tile
// (the CSS sprite needs the full sheet size for backgroundSize; with 0 the sprite
// scales to nothing and is invisible).
const sheetSizeCache = new Map<string, { width: number; height: number }>();

// Drop the #xywh media fragment so every tile in a sheet shares one URL/entry.
const sheetUrlOf = (uri: string): string => uri.split("#")[0];

/**
 * Seek-bar hover preview. Maps the sprite tile covering `time` into a CSS sprite.
 * Both engines (hls.js on non-iOS + native Safari/iOS) feed the SAME renderer from
 * a client-parsed `thumbnails.vtt` (vttTiles); the sheet size is measured
 * client-side because the VTT does not declare it.
 */
export function ThumbnailPreview({
  vttTiles,
  time,
}: {
  vttTiles: ThumbTile[] | null;
  time: number;
}) {
  const [thumb, setThumb] = useState<ThumbTile | null>(null);
  const [sheet, setSheet] = useState<{ url: string; width: number; height: number } | null>(null);
  // Avoid refetching for every sub-pixel move: only refetch when crossing tiles.
  const lastRangeRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const r = lastRangeRef.current;
    if (r && time >= r.start && time < r.end) return; // same tile, keep current
    if (!vttTiles) return;
    const t = thumbAtTime(vttTiles, time);
    if (t) {
      lastRangeRef.current = { start: t.startTime, end: t.startTime + t.duration };
      setThumb(t);
    }
  }, [vttTiles, time]);

  // The sheet URL (fragment stripped) for the current tile; stable within a sheet.
  const sheetUrl = thumb && thumb.uris.length > 0 ? sheetUrlOf(thumb.uris[0]) : null;

  // Resolve the sheet's natural size (cached). Loading the image here is the same
  // fetch the browser needs to paint the sprite, so it costs nothing extra.
  useEffect(() => {
    if (!sheetUrl) return;
    const cached = sheetSizeCache.get(sheetUrl);
    if (cached) {
      setSheet({ url: sheetUrl, ...cached });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      sheetSizeCache.set(sheetUrl, size);
      if (!cancelled) setSheet({ url: sheetUrl, ...size });
    };
    img.src = sheetUrl;
    return () => {
      cancelled = true;
    };
  }, [sheetUrl]);

  // Only render once the measured size matches the current sheet (guards the brief
  // window after crossing into a not-yet-measured sheet).
  const sheetReady =
    sheet != null && sheet.url === sheetUrl && sheet.width > 0 && sheet.height > 0;
  const ready = Boolean(thumb && thumb.width > 0 && sheetReady);
  const scale = ready ? PREVIEW_WIDTH / thumb!.width : 1;

  return (
    <div className="flex flex-col items-center gap-1">
      {ready && (
        <div
          className="overflow-hidden rounded-md border border-white/20 shadow-lg"
          style={{
            width: PREVIEW_WIDTH,
            height: thumb!.height * scale,
            backgroundImage: `url(${sheetUrl})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `-${thumb!.positionX * scale}px -${thumb!.positionY * scale}px`,
            backgroundSize: `${sheet!.width * scale}px ${sheet!.height * scale}px`,
          }}
        />
      )}
      <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
        {formatTime(time)}
      </span>
    </div>
  );
}
