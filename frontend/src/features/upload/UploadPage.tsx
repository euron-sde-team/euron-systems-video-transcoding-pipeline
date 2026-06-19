import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfigBanner } from "../../components/ConfigBanner";
import { useToast } from "../../components/Toast";
import { useSettings } from "../../hooks/useSettings";
import { UploadDropzone } from "./UploadDropzone";
import { UploadQueueItem } from "./UploadQueueItem";
import { useUploadManager } from "./useUploadManager";

export function UploadPage() {
  const { configured } = useSettings();
  const toast = useToast();
  const { items, addFiles, cancelItem, clearFinished } = useUploadManager();

  const onFiles = (files: File[]) => {
    if (!configured) {
      toast.error("Configure the connection in Settings first.");
      return;
    }
    const { rejected } = addFiles(files);
    if (rejected.length) {
      toast.error(`Unsupported file type: ${rejected.join(", ")}`);
    }
  };

  const hasFinished = items.some((i) =>
    ["done", "error", "cancelled"].includes(i.status)
  );
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <ConfigBanner />

      <UploadDropzone onFiles={onFiles} />

      {items.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">
              Queue
              <span className="ml-2 font-normal text-gray-500">
                {doneCount}/{items.length} done
              </span>
            </h2>
            {hasFinished && (
              <button
                onClick={clearFinished}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear finished
              </button>
            )}
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <UploadQueueItem key={item.clientId} item={item} onCancel={cancelItem} />
            ))}
          </div>

          {doneCount > 0 && (
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
            >
              View in dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
