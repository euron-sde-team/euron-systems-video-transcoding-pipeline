import clsx from "clsx";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { formatBytes } from "../../lib/format";
import type { UploadItem } from "./useUploadManager";

const STATUS_TEXT: Record<UploadItem["status"], string> = {
  queued: "Queued",
  creating: "Preparing",
  uploading: "Uploading",
  completing: "Finalizing",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

export function UploadQueueItem({
  item,
  onCancel,
}: {
  item: UploadItem;
  onCancel: (clientId: string) => void;
}) {
  const inFlight =
    item.status === "uploading" || item.status === "creating" || item.status === "completing";
  const showBar = inFlight || item.status === "queued";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-3.5 py-3">
      <div className="shrink-0">
        {item.status === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
        {item.status === "error" && <XCircle className="h-5 w-5 text-rose-400" />}
        {item.status === "cancelled" && <XCircle className="h-5 w-5 text-gray-500" />}
        {inFlight && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
        {item.status === "queued" && <Loader2 className="h-5 w-5 text-gray-600" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium text-gray-100" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 text-xs text-gray-500">{formatBytes(item.size)}</span>
        </div>

        {showBar ? (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
            <div
              className={clsx(
                "h-full rounded-full transition-[width] duration-200",
                item.status === "queued" ? "bg-gray-600" : "bg-accent"
              )}
              style={{ width: `${item.status === "uploading" ? item.progress : item.status === "queued" ? 4 : 100}%` }}
            />
          </div>
        ) : (
          <p
            className={clsx(
              "mt-1 text-xs",
              item.status === "error" ? "text-rose-300" : "text-gray-500"
            )}
          >
            {item.status === "error" ? item.error : STATUS_TEXT[item.status]}
          </p>
        )}
      </div>

      {(inFlight || item.status === "queued") && (
        <button
          onClick={() => onCancel(item.clientId)}
          className="shrink-0 rounded p-1 text-gray-500 hover:bg-bg-raised hover:text-gray-200"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
