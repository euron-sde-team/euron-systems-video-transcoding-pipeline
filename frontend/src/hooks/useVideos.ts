import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listVideos, type ListVideosParams } from "../api/videos";
import { isNonTerminal } from "../lib/constants";
import { isConfigured } from "../lib/settingsStore";
import { queryKeys } from "./queryKeys";

/**
 * Paginated video list. Polls every 4s ONLY while at least one video on the
 * current page is still moving (uploading/uploaded/processing); otherwise idle.
 */
export function useVideos(params: ListVideosParams) {
  return useQuery({
    queryKey: queryKeys.videos(params),
    queryFn: () => listVideos(params),
    enabled: isConfigured(),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.videos.some((v) => isNonTerminal(v.status)) ? 4000 : false,
    refetchIntervalInBackground: false,
  });
}
