import clsx from "clsx";
import type { VideoStatus } from "../../types/api";

const OPTIONS: { value: VideoStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "uploaded", label: "Queued" },
  { value: "uploading", label: "Uploading" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

interface Props {
  value: VideoStatus | "";
  onChange: (value: VideoStatus | "") => void;
}

export function StatusFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value || "all"}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "border-accent/40 bg-accent/15 text-accent"
              : "border-border text-gray-400 hover:bg-bg-raised hover:text-gray-200"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
