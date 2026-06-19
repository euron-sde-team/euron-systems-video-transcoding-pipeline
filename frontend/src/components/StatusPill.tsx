import clsx from "clsx";
import { STATUS_STYLES } from "../lib/constants";
import type { VideoStatus } from "../types/api";

export function StatusPill({ status, className }: { status: VideoStatus; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        s.pill,
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
