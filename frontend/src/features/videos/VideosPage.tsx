import { Film, RefreshCw, UploadCloud } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfigBanner } from "../../components/ConfigBanner";
import { Pagination } from "../../components/Pagination";
import { useSettings } from "../../hooks/useSettings";
import { useVideos } from "../../hooks/useVideos";
import { ApiError } from "../../lib/apiClient";
import type { VideoStatus } from "../../types/api";
import { StatusFilter } from "./StatusFilter";
import { VideoCard } from "./VideoCard";

const LIMIT = 12;

export function VideosPage() {
  const { configured } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const status = (searchParams.get("status") ?? "") as VideoStatus | "";

  const patchParams = (next: Record<string, string>) => {
    const merged = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([k, v]) => (v ? merged.set(k, v) : merged.delete(k)));
    setSearchParams(merged);
  };

  const { data, isLoading, isError, error, isFetching, refetch } = useVideos({
    page,
    limit: LIMIT,
    status,
  });

  return (
    <div className="px-6 py-6">
      <ConfigBanner />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <StatusFilter value={status} onChange={(s) => patchParams({ status: s, page: "" })} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-gray-400 hover:bg-bg-raised hover:text-gray-100"
            title="Refresh"
          >
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </button>
          <Link
            to="/upload"
            className="flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <UploadCloud className="h-4 w-4" /> Upload
          </Link>
        </div>
      </div>

      {configured && isError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error instanceof ApiError && error.isAuth
            ? "Authentication failed. Check your service key and tenant id in Settings."
            : (error as Error)?.message || "Failed to load videos."}
        </div>
      )}

      {configured && isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-bg-subtle">
              <div className="aspect-video w-full animate-pulse bg-bg-raised" />
              <div className="space-y-3 p-3.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-bg-raised" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-bg-raised" />
              </div>
            </div>
          ))}
        </div>
      )}

      {configured && !isLoading && !isError && data && data.videos.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Film className="mb-3 h-10 w-10 text-gray-700" />
          <p className="text-sm text-gray-400">
            {status ? `No ${status} videos.` : "No videos yet."}
          </p>
          <Link
            to="/upload"
            className="mt-4 flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <UploadCloud className="h-4 w-4" /> Upload your first video
          </Link>
        </div>
      )}

      {configured && data && data.videos.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          <Pagination
            page={page}
            limit={LIMIT}
            total={data.total}
            onPageChange={(p) => patchParams({ page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
