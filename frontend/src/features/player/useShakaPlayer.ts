// NOT IN USE (HLS-only migration): the Shaka/cbcs + ClearKey engine hook.
// Retained for reference / a possible future DASH + DRM path, but no longer
// imported anywhere. The active player uses useHlsPlayer (non-iOS) + useNativeHls
// (iOS). PlayerError + PlayerSource now live in useHlsPlayer.ts.
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import shaka from "../../lib/shaka";
import { buildPlayerConfig, fetchClearKeys, manifestMime } from "./shakaConfig";

export type ShakaPlayer = InstanceType<typeof shaka.Player>;

export interface PlayerError {
  code?: number;
  category?: number;
  message: string;
  /** True when the key endpoint rejected the playback token (re-mint + retry). */
  isKeyAuth: boolean;
}

export interface PlayerSource {
  manifestUrl: string;
  /** Absolute key URL incl. ?token=...; omit for unencrypted assets. */
  keyUrl?: string;
  thumbnailsVttUrl?: string;
  /**
   * Absolute AES-128 HLS master URL (incl. ?token=) for the native Safari path.
   * When present and ClearKey EME is unavailable, the player uses native <video>
   * instead of Shaka. Omit to force the Shaka/cbcs path.
   */
  nativeHlsUrl?: string;
}

interface UseShakaPlayerResult {
  player: ShakaPlayer | null;
  isBuffering: boolean;
  error: PlayerError | null;
  /** Id of the image (thumbnails) track for getThumbnails(), or null. */
  thumbnailTrackId: number | null;
  retry: () => void;
}

/**
 * Owns the shaka-player core lifecycle for one <video>. Fetches the clear-key
 * first, configures abr/streaming/drm, loads the manifest, and registers the
 * thumbnails track. StrictMode-safe: each effect run owns its own player and
 * destroys it on cleanup.
 */
export function useShakaPlayer(
  videoRef: RefObject<HTMLVideoElement>,
  source: PlayerSource | null
): UseShakaPlayerResult {
  const [player, setPlayer] = useState<ShakaPlayer | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<PlayerError | null>(null);
  const [thumbnailTrackId, setThumbnailTrackId] = useState<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  // Stable key so the effect only re-runs when the actual source changes.
  const sourceKey = source
    ? `${source.manifestUrl}|${source.keyUrl ?? ""}|${source.thumbnailsVttUrl ?? ""}`
    : "";

  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    const video = videoRef.current;
    const src = sourceRef.current;
    if (!video || !src) return;

    let cancelled = false;
    setError(null);
    setThumbnailTrackId(null);

    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      setError({ message: "This browser does not support the required media APIs.", isKeyAuth: false });
      return;
    }

    const instance = new shaka.Player();

    const onBuffering = (event: Event) => {
      setIsBuffering(Boolean((event as unknown as { buffering?: boolean }).buffering));
    };
    const onError = (event: Event) => {
      const detail = (event as unknown as { detail?: { code?: number; category?: number } }).detail;
      reportError(detail);
    };

    function reportError(detail?: { code?: number; category?: number }) {
      if (cancelled) return;
      // Shaka DRM/network error categories; 6xxx codes are DRM, 1001 is a bad HTTP status.
      const isKeyAuth = detail?.category === 6 || detail?.code === 1001;
      setError({
        code: detail?.code,
        category: detail?.category,
        message: shakaErrorMessage(detail?.code),
        isKeyAuth,
      });
    }

    (async () => {
      try {
        await instance.attach(video);
        if (cancelled) return;

        const clearKeys = await fetchClearKeys(src.keyUrl);
        if (cancelled) return;

        instance.configure(buildPlayerConfig(clearKeys));
        instance.addEventListener("buffering", onBuffering);
        instance.addEventListener("error", onError);

        await instance.load(src.manifestUrl, undefined, manifestMime(src.manifestUrl));
        if (cancelled) return;

        if (src.thumbnailsVttUrl) {
          try {
            const track = await instance.addThumbnailsTrack(src.thumbnailsVttUrl, "text/vtt");
            if (!cancelled) setThumbnailTrackId(track.id);
          } catch {
            // Non-fatal: scrub previews simply won't render.
          }
        }

        if (!cancelled) setPlayer(instance);
      } catch (err) {
        const e = err as { code?: number; category?: number; status?: number };
        if (typeof e?.status === "number") {
          // Thrown by fetchClearKeys (key endpoint). 401/403 => token expired/invalid.
          if (!cancelled)
            setError({
              message: `Could not load the decryption key (${e.status}).`,
              isKeyAuth: e.status === 401 || e.status === 403,
            });
        } else {
          reportError(e);
        }
      }
    })();

    return () => {
      cancelled = true;
      instance.removeEventListener("buffering", onBuffering);
      instance.removeEventListener("error", onError);
      setPlayer(null);
      void instance.destroy();
    };
  }, [sourceKey, retryNonce, videoRef]);

  return { player, isBuffering, error, thumbnailTrackId, retry };
}

function shakaErrorMessage(code?: number): string {
  if (code === 1001) return "A media segment or manifest could not be loaded.";
  if (code && code >= 6000 && code < 7000) return "Playback was blocked by a key/DRM error.";
  return "Playback failed. The video may still be processing or unavailable.";
}
