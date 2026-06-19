import { ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { StageProgress } from "../../components/StageProgress";
import { StatusPill } from "../../components/StatusPill";
import { useMintPlaybackToken } from "../../hooks/useMutations";
import { useSettings } from "../../hooks/useSettings";
import { useVideo } from "../../hooks/useVideo";
import { apiUrl } from "../../lib/apiClient";
import type { VideoResponse } from "../../types/api";
import { VideoPlayer } from "./VideoPlayer";

export function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const manualManifest = searchParams.get("manifest");

  // Dev escape hatch: ?manifest=<url> plays any manifest (e.g. a public demo
  // asset) without a backend video, to iterate on the player UI in isolation.
  if (manualManifest) {
    return (
      <div className="px-6 py-6">
        <BackLink />
        <div className="mt-4">
          <VideoPlayer source={{ manifestUrl: manualManifest }} orientation="landscape" />
          <p className="mt-3 text-xs text-gray-500">Manual manifest (no decryption key).</p>
        </div>
      </div>
    );
  }

  return <VideoDetail id={id} />;
}

function VideoDetail({ id }: { id?: string }) {
  const { data: video, isLoading, isError, error } = useVideo(id);

  return (
    <div className="px-6 py-6">
      <BackLink />

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-600" />
        </div>
      )}

      {isError && (
        <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {(error as Error)?.message || "Could not load this video."}
        </div>
      )}

      {video && (
        <div className="mt-4">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-100">{video.displayName}</h2>
            <StatusPill status={video.status} />
          </div>

          {video.status === "ready" && video.playback ? (
            <ReadyPlayer video={video} />
          ) : (
            <StatusPanel video={video} />
          )}
        </div>
      )}
    </div>
  );
}

/** Mints a playback token (when the asset is encrypted) and mounts the player. */
function ReadyPlayer({ video }: { video: VideoResponse }) {
  const { settings } = useSettings();
  const mint = useMintPlaybackToken();
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const needsKey = video.protection !== "none";

  const requestToken = useCallback(() => {
    setTokenError(null);
    mint.mutate(
      { id: video.id, userId: settings.previewUserId || "admin-preview", ttlSeconds: 3600 },
      {
        onSuccess: (res) => setToken(res.token),
        onError: (err) => setTokenError((err as Error)?.message || "Could not mint playback token"),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, settings.previewUserId]);

  useEffect(() => {
    if (needsKey) requestToken();
  }, [needsKey, requestToken]);

  const playback = video.playback!;
  const keyUrl =
    needsKey && token
      ? `${apiUrl(playback.keyEndpoint)}?token=${encodeURIComponent(token)}`
      : undefined;

  if (needsKey && !token) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black">
        {tokenError ? (
          <div className="text-center">
            <p className="text-sm text-rose-300">{tokenError}</p>
            <button
              onClick={requestToken}
              className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Retry
            </button>
          </div>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-gray-600" />
        )}
      </div>
    );
  }

  return (
    <VideoPlayer
      source={{
        manifestUrl: settings.streamFormat === "dash" ? playback.dash : playback.hls,
        keyUrl,
        thumbnailsVttUrl: playback.thumbnailsVtt,
      }}
      poster={playback.poster}
      orientation={video.orientation ?? "landscape"}
      watermarkText={
        video.watermark === "dynamic_overlay"
          ? settings.previewUserId || "admin-preview"
          : undefined
      }
      onKeyAuthRetry={requestToken}
    />
  );
}

/** Non-ready states: live progress, failure detail, or cancelled notice. */
function StatusPanel({ video }: { video: VideoResponse }) {
  return (
    <div className="rounded-xl border border-border bg-bg-subtle p-6">
      {video.status === "failed" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-rose-300">Transcoding failed</p>
          {video.error && <p className="text-sm text-gray-400">{video.error}</p>}
          <p className="text-xs text-gray-500">Use Retry from the dashboard to requeue this video.</p>
        </div>
      ) : video.status === "cancelled" ? (
        <p className="text-sm text-gray-400">This video was cancelled.</p>
      ) : (
        <div className="space-y-3">
          <StageProgress video={video} />
          <p className="text-xs text-gray-500">
            This page updates automatically while the video is processing.
          </p>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200"
    >
      <ArrowLeft className="h-4 w-4" /> Back to videos
    </Link>
  );
}
