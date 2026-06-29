import type { ListVideosParams } from "../api/videos";

/** Centralized React Query keys so invalidations stay consistent. */
export const queryKeys = {
  health: ["health"] as const,
  videos: (params: ListVideosParams) => ["videos", params] as const,
  video: (id: string) => ["video", id] as const,
  // Keyed by the SORTED id set, so paging/reordering reuses cache for the same set.
  videoStorage: (sortedIds: string[]) => ["video-storage", sortedIds] as const,
};
