import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../api/health";
import { isConfigured } from "../lib/settingsStore";
import { queryKeys } from "./queryKeys";

/** Drives the topbar connection dot. Cheap, polls every 15s. */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    enabled: isConfigured(),
    refetchInterval: 15_000,
    retry: false,
    staleTime: 10_000,
  });
}
