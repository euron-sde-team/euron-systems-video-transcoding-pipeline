import { useRef, useState } from "react";
import type { BufferedRange } from "./usePlaybackState";
import { ThumbnailPreview } from "./ThumbnailPreview";
import type { ShakaPlayer } from "./useShakaPlayer";

interface SeekBarProps {
  currentTime: number;
  duration: number;
  buffered: BufferedRange[];
  player: ShakaPlayer | null;
  thumbnailTrackId: number | null;
  onSeek: (time: number) => void;
  onScrubChange: (scrubbing: boolean) => void;
}

const PREVIEW_HALF_WIDTH = 88; // ~half of the 160px sprite preview + padding

export function SeekBar({
  currentTime,
  duration,
  buffered,
  player,
  thumbnailTrackId,
  onSeek,
  onScrubChange,
}: SeekBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);

  const safeDuration = duration > 0 ? duration : 0;

  const timeAtClientX = (clientX: number): { x: number; time: number } => {
    const rect = barRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { x: ratio * rect.width, time: ratio * safeDuration };
  };

  const handleMove = (clientX: number) => {
    if (!barRef.current || safeDuration === 0) return;
    const next = timeAtClientX(clientX);
    setHover(next);
    if (dragging) onSeek(next.time);
  };

  const displayTime = dragging && hover ? hover.time : currentTime;
  const playedPct = safeDuration ? (displayTime / safeDuration) * 100 : 0;
  const barWidth = barRef.current?.getBoundingClientRect().width ?? 0;
  const previewLeft = hover
    ? Math.max(PREVIEW_HALF_WIDTH, Math.min(barWidth - PREVIEW_HALF_WIDTH, hover.x))
    : 0;

  return (
    <div className="relative">
      {/* Hover preview tooltip */}
      {hover && safeDuration > 0 && (
        <div
          className="pointer-events-none absolute bottom-5 z-10 -translate-x-1/2"
          style={{ left: previewLeft }}
        >
          <ThumbnailPreview player={player} trackId={thumbnailTrackId} time={hover.time} />
        </div>
      )}

      {/* Tall hit area for easy grabbing; the visible bar sits in the middle. */}
      <div
        ref={barRef}
        className="group/seek flex h-4 cursor-pointer items-center"
        onPointerDown={(e) => {
          if (safeDuration === 0) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          onScrubChange(true);
          const next = timeAtClientX(e.clientX);
          setHover(next);
          onSeek(next.time);
        }}
        onPointerMove={(e) => handleMove(e.clientX)}
        onPointerUp={(e) => {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          setDragging(false);
          onScrubChange(false);
        }}
        onPointerLeave={() => {
          if (!dragging) setHover(null);
        }}
      >
        <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/seek:h-1.5">
          {/* Buffered ranges */}
          {buffered.map((r, i) => (
            <div
              key={i}
              className="absolute inset-y-0 rounded-full bg-white/35"
              style={{
                left: `${safeDuration ? (r.start / safeDuration) * 100 : 0}%`,
                width: `${safeDuration ? ((r.end - r.start) / safeDuration) * 100 : 0}%`,
              }}
            />
          ))}
          {/* Played */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${playedPct}%` }}
          />
          {/* Scrubber handle */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
            style={{ left: `${playedPct}%`, opacity: dragging ? 1 : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
