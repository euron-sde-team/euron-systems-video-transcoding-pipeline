/**
 * Connection settings live entirely in the browser (pure-SPA model): the operator
 * supplies the API base, the shared service key, a tenant id, and a preview user id
 * on the Settings page. We persist them in localStorage and read them at call time
 * so the API client always sees the latest values without a reload.
 */

import type { StreamFormat } from "../types/api";

const STORAGE_KEY = "euron_vod_settings";

export interface AppSettings {
  /** e.g. http://localhost:4020/api/v1 */
  apiBase: string;
  /** Shared SERVICE_API_KEY (sent as X-Service-Key). */
  serviceKey: string;
  /** Tenant UUID (sent as X-Tenant-Id). */
  tenantId: string;
  /** userId baked into minted playback tokens for the operator preview. */
  previewUserId: string;
  /** NOT IN USE (HLS-only migration): manifest format toggle (HLS/DASH). Kept so
   *  persisted settings keep parsing; the player always loads AES-128 HLS now. */
  streamFormat: StreamFormat;
}

const ENV_API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:4020/api/v1";

const DEFAULTS: AppSettings = {
  apiBase: ENV_API_BASE,
  serviceKey: "",
  tenantId: "",
  previewUserId: "admin-preview",
  // NOT IN USE (HLS-only migration): the player always loads the AES-128 HLS tree;
  // retained only so older persisted settings keep parsing.
  streamFormat: "hls",
};

type Listener = (settings: AppSettings) => void;
const listeners = new Set<Listener>();

function read(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: AppSettings = read();

export function getSettings(): AppSettings {
  return current;
}

export function saveSettings(next: Partial<AppSettings>): AppSettings {
  current = { ...current, ...next };
  // Trim trailing slashes on the base so path joins are predictable.
  current.apiBase = current.apiBase.replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  listeners.forEach((l) => l(current));
  return current;
}

/** True once the operator has supplied the minimum needed to call the API. */
export function isConfigured(s: AppSettings = current): boolean {
  return Boolean(s.apiBase && s.serviceKey && s.tenantId);
}

/** Subscribe to settings changes (used by the React hook below). */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
