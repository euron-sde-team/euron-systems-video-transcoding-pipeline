import { useQuery } from "@tanstack/react-query";
import { getVideo } from "../api/videos";
import { isNonTerminal } from "../lib/constants";
import { isConfigured } from "../lib/settingsStore";
import { queryKeys } from "./queryKeys";

/**
 * Single video detail. Polls every 3s while non-terminal so the detail page
 * tracks transcode progress and flips to the player once status is "ready".
 */
export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.video(id ?? ""),
    queryFn: () => getVideo(id as string),
    enabled: Boolean(id) && isConfigured(),
    refetchInterval: (query) =>
      query.state.data && isNonTerminal(query.state.data.status) ? 3000 : false,
    refetchIntervalInBackground: false,
  });
}
