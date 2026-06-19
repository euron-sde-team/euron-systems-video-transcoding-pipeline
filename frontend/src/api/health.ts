import { request } from "../lib/apiClient";
import type { HealthResponse } from "../types/api";

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { skipTenant: true });
}
