import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  cancelVideo,
  mintPlaybackToken,
  renameVideo,
  retryVideo,
} from "../api/videos";
import type { VideoListResponse, VideoResponse } from "../types/api";

/** Optimistically patch a video everywhere it is cached (detail + every list page). */
function patchVideoInCaches(qc: QueryClient, id: string, patch: Partial<VideoResponse>) {
  qc.setQueryData<VideoResponse>(["video", id], (prev) =>
    prev ? { ...prev, ...patch } : prev
  );
  qc.setQueriesData<VideoListResponse>({ queryKey: ["videos"] }, (prev) =>
    prev
      ? { ...prev, videos: prev.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }
      : prev
  );
}

function snapshotCaches(qc: QueryClient) {
  return {
    video: qc.getQueriesData<VideoResponse>({ queryKey: ["video"] }),
    videos: qc.getQueriesData<VideoListResponse>({ queryKey: ["videos"] }),
  };
}

type Snapshot = ReturnType<typeof snapshotCaches>;

function restoreCaches(qc: QueryClient, snapshot: Snapshot) {
  snapshot.video.forEach(([key, data]) => qc.setQueryData(key, data));
  snapshot.videos.forEach(([key, data]) => qc.setQueryData(key, data));
}

function useOptimisticVideoMutation(
  mutationFn: (id: string) => Promise<VideoResponse>,
  optimisticPatch: Partial<VideoResponse>
) {
  const qc = useQueryClient();
  return useMutation<VideoResponse, Error, string, Snapshot>({
    mutationFn,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["video", id] });
      await qc.cancelQueries({ queryKey: ["videos"] });
      const snapshot = snapshotCaches(qc);
      patchVideoInCaches(qc, id, optimisticPatch);
      return snapshot;
    },
    onError: (_err, _id, snapshot) => {
      if (snapshot) restoreCaches(qc, snapshot);
    },
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: ["video", id] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

/** Retry a failed video: optimistically flips it back to "uploaded" (queued). */
export function useRetryVideo() {
  return useOptimisticVideoMutation(retryVideo, { status: "uploaded", error: null, stage: null });
}

/** Cancel a pre-terminal video: optimistically flips it to "cancelled". */
export function useCancelVideo() {
  return useOptimisticVideoMutation(cancelVideo, { status: "cancelled" });
}

/** Rename a video: optimistically updates title + displayName. */
export function useRenameVideo() {
  const qc = useQueryClient();
  return useMutation<VideoResponse, Error, { id: string; title: string }, Snapshot>({
    mutationFn: ({ id, title }) => renameVideo(id, title),
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: ["video", id] });
      await qc.cancelQueries({ queryKey: ["videos"] });
      const snapshot = snapshotCaches(qc);
      patchVideoInCaches(qc, id, { title, displayName: title });
      return snapshot;
    },
    onError: (_err, _vars, snapshot) => {
      if (snapshot) restoreCaches(qc, snapshot);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ["video", id] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

/** Mint a short-TTL playback token for the operator preview. */
export function useMintPlaybackToken() {
  return useMutation({
    mutationFn: ({ id, userId, ttlSeconds }: { id: string; userId: string; ttlSeconds?: number }) =>
      mintPlaybackToken(id, userId, ttlSeconds),
  });
}

/** Returns a function that refreshes all video lists (used after uploads). */
export function useInvalidateVideos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["videos"] });
}
