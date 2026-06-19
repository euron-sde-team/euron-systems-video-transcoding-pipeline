import { STAGE_LABELS } from "../lib/constants";
import type { VideoResponse } from "../types/api";

/**
 * Progress bar + stage label for a non-terminal video. Renders nothing for
 * terminal videos (ready/failed/cancelled).
 */
export function StageProgress({ video }: { video: VideoResponse }) {
  const isMoving =
    video.status === "uploading" || video.status === "uploaded" || video.status === "processing";
  if (!isMoving) return null;

  const stageLabel =
    video.status === "processing"
      ? (video.stage && STAGE_LABELS[video.stage]) || "Processing"
      : video.status === "uploaded"
        ? "Queued for processing"
        : "Uploading";
  const pct = Math.max(0, Math.min(100, video.progress ?? 0));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{stageLabel}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
