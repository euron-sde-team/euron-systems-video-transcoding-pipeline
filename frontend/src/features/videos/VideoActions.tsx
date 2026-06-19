import { Copy, Pencil, Play, RotateCcw, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { useCancelVideo, useRetryVideo } from "../../hooks/useMutations";
import { ApiError } from "../../lib/apiClient";
import type { VideoResponse } from "../../types/api";

interface Props {
  video: VideoResponse;
  onRename: () => void;
}

/** Status-gated action buttons. The server is the source of truth (we catch 409). */
export function VideoActions({ video, onRename }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const retry = useRetryVideo();
  const cancel = useCancelVideo();

  const canPlay = video.status === "ready";
  const canRetry = video.status === "failed";
  const canCancel =
    video.status === "uploading" || video.status === "uploaded" || video.status === "failed";

  const handle = (mutate: typeof retry, verb: string) =>
    mutate.mutate(video.id, {
      onError: (err) => {
        const msg = err instanceof ApiError ? err.message : `Could not ${verb} video`;
        toast.error(msg);
      },
    });

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(video.id);
      toast.success("Video ID copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-bg-raised hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="flex items-center gap-0.5">
      {canPlay && (
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent/15 px-2.5 text-xs font-semibold text-accent hover:bg-accent/25"
          onClick={() => navigate(`/videos/${video.id}`)}
          title="Play"
        >
          <Play className="h-3.5 w-3.5" /> Play
        </button>
      )}
      {canRetry && (
        <button
          className={btn}
          onClick={() => handle(retry, "retry")}
          disabled={retry.isPending}
          title="Retry"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      {canCancel && (
        <button
          className={btn}
          onClick={() => handle(cancel, "cancel")}
          disabled={cancel.isPending}
          title="Cancel"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
      <button className={btn} onClick={onRename} title="Rename">
        <Pencil className="h-4 w-4" />
      </button>
      <button className={btn} onClick={copyId} title="Copy ID">
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
