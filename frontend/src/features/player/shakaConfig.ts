import type { ClearKeyResponse } from "../../types/api";

export type ManifestType = "hls" | "dash";

const MIME: Record<ManifestType, string> = {
  hls: "application/x-mpegurl",
  dash: "application/dash+xml",
};

/** DASH manifests end in .mpd; everything else is treated as HLS. */
export function inferManifestType(url: string): ManifestType {
  return url.includes(".mpd") ? "dash" : "hls";
}

export function manifestMime(url: string): string {
  return MIME[inferManifestType(url)];
}

/**
 * Fetch the cbcs clear-key map from the authenticated key endpoint. Returns null
 * when no key URL is supplied (unencrypted assets, e.g. a public demo manifest).
 * Reminder: clear-key is deterrence, not DRM.
 */
export async function fetchClearKeys(
  keyUrl: string | undefined
): Promise<Record<string, string> | null> {
  if (!keyUrl) return null;
  const res = await fetch(keyUrl, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`Key fetch failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const body = (await res.json()) as ClearKeyResponse;
  return body.clearKeys ?? null;
}

/** The proven streaming/abr config from the original EuronVideoPlayer. */
export function buildPlayerConfig(clearKeys: Record<string, string> | null) {
  return {
    abr: {
      enabled: true,
      // Low initial estimate -> fast start at a low rung, then ramp up.
      defaultBandwidthEstimate: 800_000,
    },
    streaming: {
      bufferingGoal: 30,
      rebufferingGoal: 2,
      bufferBehind: 30,
    },
    ...(clearKeys ? { drm: { clearKeys } } : {}),
  };
}
