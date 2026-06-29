import { Captions, Check, Copy, Film, HardDrive, Loader2, RectangleHorizontal, RectangleVertical, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StageProgress } from "../../components/StageProgress";
import { StatusPill } from "../../components/StatusPill";
import { useToast } from "../../components/Toast";
import { useRenameVideo } from "../../hooks/useMutations";
import { formatBytes, formatRelativeTime } from "../../lib/format";
import { ApiError } from "../../lib/apiClient";
import type { Orientation, VideoResponse } from "../../types/api";
import { VideoActions } from "./VideoActions";

const ORIENTATION_ICON: Record<Orientation, typeof Square> = {
  landscape: RectangleHorizontal,
  portrait: RectangleVertical,
  square: Square,
};

function Poster({ video }: { video: VideoResponse }) {
  const ready = video.status === "ready" && video.playback?.poster;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-black">
      {ready ? (
        <img
          src={video.playback!.poster}
          alt={video.displayName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-raised">
          {video.status === "processing" || video.status === "uploading" ? (
            <Loader2 className="h-7 w-7 animate-spin text-gray-600" />
          ) : (
            <Film className="h-7 w-7 text-gray-700" />
          )}
        </div>
      )}
      <div className="absolute left-2 top-2">
        <StatusPill status={video.status} />
      </div>
    </div>
  );
}

function RenameRow({ video, onDone }: { video: VideoResponse; onDone: () => void }) {
  const toast = useToast();
  const rename = useRenameVideo();
  const [value, setValue] = useState(video.title ?? video.displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const title = value.trim();
    if (!title || title === video.title) return onDone();
    rename.mutate(
      { id: video.id, title },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Rename failed"),
        onSettled: onDone,
      }
    );
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        className="min-w-0 flex-1 rounded border border-border bg-bg-subtle px-2 py-1 text-sm text-gray-100 outline-none focus:border-accent/60"
      />
      <button className="text-emerald-400 hover:text-emerald-300" onClick={submit} title="Save">
        <Check className="h-4 w-4" />
      </button>
      <button className="text-gray-500 hover:text-gray-300" onClick={onDone} title="Cancel">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Label + truncated mono value + copy button. For long ids (R2 key, tenant id). */
function CopyableMeta({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-600">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-400" title={value}>
        {value}
      </code>
      <button
        onClick={copy}
        className="shrink-0 text-gray-600 transition-colors hover:text-gray-300"
        title={`Copy ${label}`}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function VideoCard({
  video,
  r2Bytes,
  r2Loading,
}: {
  video: VideoResponse;
  /** Live R2 footprint from the batch LIST; falls back to the cached column value. */
  r2Bytes?: number;
  r2Loading?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const OrientationIcon = video.orientation ? ORIENTATION_ICON[video.orientation] : null;
  const isReady = video.status === "ready";
  // Prefer the live LIST result; show the cached output_bytes instantly while it loads.
  const r2 = r2Bytes ?? video.outputBytes;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg-subtle transition-colors hover:border-gray-600">
      {isReady ? (
        <Link to={`/videos/${video.id}`}>
          <Poster video={video} />
        </Link>
      ) : (
        <Poster video={video} />
      )}

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="min-h-[2.5rem]">
          {renaming ? (
            <RenameRow video={video} onDone={() => setRenaming(false)} />
          ) : (
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-100" title={video.displayName}>
              {video.displayName}
            </h3>
          )}
        </div>

        <StageProgress video={video} />

        {video.status === "failed" && video.error && (
          <p className="line-clamp-2 rounded border border-rose-500/20 bg-rose-500/5 px-2 py-1 text-xs text-rose-300">
            {video.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {OrientationIcon && (
            <span className="flex items-center gap-1 capitalize">
              <OrientationIcon className="h-3.5 w-3.5" />
              {video.orientation}
            </span>
          )}
          {video.sourceBytes != null && <span>{formatBytes(video.sourceBytes)}</span>}
          {video.captionsLangs.length > 0 && (
            <span className="flex items-center gap-1">
              <Captions className="h-3.5 w-3.5" />
              {video.captionsLangs.map((l) => l.toUpperCase()).join(", ")}
            </span>
          )}
          <span>{formatRelativeTime(video.createdAt)}</span>
        </div>

        <div className="mt-auto space-y-1.5 border-t border-border/60 pt-2.5">
          <CopyableMeta label="R2 key" value={video.outputPrefix} />
          <CopyableMeta label="Tenant" value={video.tenantId} />
          <div className="flex items-center justify-between pt-0.5">
            <span className="flex items-center gap-1 text-[11px] text-gray-500" title="Live space used in the R2 output bucket">
              {isReady && r2 != null ? (
                <>
                  <HardDrive className="h-3 w-3" />
                  {formatBytes(r2)}
                </>
              ) : isReady && r2Loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="font-mono text-gray-600">{video.id.slice(0, 8)}</span>
              )}
            </span>
            <VideoActions video={video} onRename={() => setRenaming(true)} />
          </div>
        </div>
      </div>
    </div>
  );
}
