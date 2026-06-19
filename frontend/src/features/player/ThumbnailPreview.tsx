import { useEffect, useRef, useState } from "react";
import { formatTime } from "../../lib/format";
import type { ShakaPlayer } from "./useShakaPlayer";

type Thumbnail = NonNullable<Awaited<ReturnType<ShakaPlayer["getThumbnails"]>>>;

const PREVIEW_WIDTH = 160; // px

/**
 * Seek-bar hover preview. Asks Shaka for the sprite tile covering `time` and maps
 * the parsed { positionX/Y, width/height, imageWidth/Height, uris } into a CSS
 * sprite. Shaka has already parsed the WebVTT #xywh, so we never touch the VTT.
 */
export function ThumbnailPreview({
  player,
  trackId,
  time,
}: {
  player: ShakaPlayer | null;
  trackId: number | null;
  time: number;
}) {
  const [thumb, setThumb] = useState<Thumbnail | null>(null);
  // Avoid refetching for every sub-pixel move: only refetch when crossing tiles.
  const lastRangeRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!player || trackId == null) return;
    const r = lastRangeRef.current;
    if (r && time >= r.start && time < r.end) return; // same tile, keep current

    let cancelled = false;
    player
      .getThumbnails(trackId, time)
      .then((t) => {
        if (cancelled || !t) return;
        lastRangeRef.current = { start: t.startTime, end: t.startTime + t.duration };
        setThumb(t);
      })
      .catch(() => {
        /* previews are best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [player, trackId, time]);

  const hasSprite = thumb && thumb.uris.length > 0 && thumb.width > 0;
  const scale = hasSprite ? PREVIEW_WIDTH / thumb!.width : 1;

  return (
    <div className="flex flex-col items-center gap-1">
      {hasSprite && (
        <div
          className="overflow-hidden rounded-md border border-white/20 shadow-lg"
          style={{
            width: PREVIEW_WIDTH,
            height: thumb!.height * scale,
            backgroundImage: `url(${thumb!.uris[0]})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `-${thumb!.positionX * scale}px -${thumb!.positionY * scale}px`,
            backgroundSize: `${thumb!.imageWidth * scale}px ${thumb!.imageHeight * scale}px`,
          }}
        />
      )}
      <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
        {formatTime(time)}
      </span>
    </div>
  );
}
