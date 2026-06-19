import { getSettings } from "./settingsStore";

/**
 * Typed error for any non-2xx API response. `status` lets the UI branch on
 * 401/403 (bad creds), 409 (illegal transition), 422 (bad input), 429 (cap).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** The backend's standard success envelope: { data, statusCode, message, success }. */
interface SuccessEnvelope<T> {
  data: T;
  statusCode: number;
  message: string;
  success: true;
}

interface ErrorEnvelope {
  error?: { message?: string; field?: string };
  message?: string;
  statusCode?: number;
  success?: false;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip X-Tenant-Id (only /health does not require a tenant). */
  skipTenant?: boolean;
  signal?: AbortSignal;
}

function buildHeaders(skipTenant: boolean): Headers {
  const { serviceKey, tenantId } = getSettings();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (serviceKey) headers.set("X-Service-Key", serviceKey);
  if (!skipTenant && tenantId) headers.set("X-Tenant-Id", tenantId);
  return headers;
}

/** Absolute API URL for a relative path like "/videos/:id/key". */
export function apiUrl(path: string): string {
  const { apiBase } = getSettings();
  return `${apiBase.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipTenant = false, signal } = opts;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: buildHeaders(skipTenant),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // Network/DNS/CORS failure: surface a clear, actionable message.
    throw new ApiError(0, (err as Error)?.message || "Network error reaching the API");
  }

  // 204 No Content (none expected today, but be safe).
  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body (unlikely from this API).
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
    return undefined as T;
  }

  if (!res.ok) {
    const env = payload as ErrorEnvelope;
    const message = env?.error?.message || env?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, env?.error?.field);
  }

  return (payload as SuccessEnvelope<T>).data;
}
