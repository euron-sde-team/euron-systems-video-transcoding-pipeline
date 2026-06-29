import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getVideosStorage } from "../api/videos";
import { isConfigured } from "../lib/settingsStore";
import { queryKeys } from "./queryKeys";

/**
 * LIVE per-video R2 footprint via batched ListObjectsV2 (one call carrying every
 * id). R2 output is immutable once a video is ready, so this is cached hard, the
 * videos list can poll every 4s without re-triggering any R2 LIST calls.
 *
 * Pass only READY video ids: videos still processing have no finished output
 * tree to measure, and listing them would waste calls.
 */
export function useVideosStorage(ids: string[]) {
  // React Query hashes the key structurally, so a fresh array each render is
  // fine; sorting makes the same id SET share one cache entry across re-orders.
  const sorted = [...ids].sort();

  const query = useQuery({
    queryKey: queryKeys.videoStorage(sorted),
    queryFn: () => getVideosStorage(sorted),
    enabled: isConfigured() && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const byId = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of query.data?.items ?? []) m.set(it.id, it.bytes);
    return m;
  }, [query.data]);

  return { ...query, byId, total: query.data?.total ?? 0 };
}
