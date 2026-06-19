import type { VideoStatus } from "../types/api";

/** Statuses still in motion: poll while any video is in one of these. */
export const NON_TERMINAL_STATUSES: ReadonlySet<VideoStatus> = new Set<VideoStatus>([
  "uploading",
  "uploaded",
  "processing",
]);

export function isNonTerminal(status: VideoStatus): boolean {
  return NON_TERMINAL_STATUSES.has(status);
}

/** Extensions the backend accepts (mirrors ALLOWED_UPLOAD_EXT in the API). */
export const ALLOWED_UPLOAD_EXTS = ["mp4", "mov", "mkv", "webm", "m4v"] as const;

export const ACCEPT_ATTR = ".mp4,.mov,.mkv,.webm,.m4v,video/*";

/** Max concurrent active uploads (the rest queue). */
export const UPLOAD_CONCURRENCY = 3;

/** Tailwind-ish color tokens per status, used by the status pill. */
export const STATUS_STYLES: Record<VideoStatus, { label: string; dot: string; pill: string }> = {
  uploading: {
    label: "Uploading",
    dot: "bg-sky-400",
    pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  uploaded: {
    label: "Queued",
    dot: "bg-indigo-400",
    pill: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  processing: {
    label: "Processing",
    dot: "bg-amber-400 animate-pulse",
    pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  ready: {
    label: "Ready",
    dot: "bg-emerald-400",
    pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  failed: {
    label: "Failed",
    dot: "bg-rose-500",
    pill: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-gray-500",
    pill: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  },
};

export const STAGE_LABELS: Record<string, string> = {
  transcoding: "Transcoding",
  transcribing: "Generating captions",
  packaging: "Packaging",
  uploading_output: "Uploading output",
};
