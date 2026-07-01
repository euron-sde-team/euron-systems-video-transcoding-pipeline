import Hls from "hls.js";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Player error contract shared by both engines (hls.js + native). `isKeyAuth`
 * lets the VideoPlayer re-mint the playback token and retry on a 401/403.
 */
export interface PlayerError {
  code?: number;
  message: string;
  isKeyAuth: boolean;
}

/**
 * Source for the AES-128 HLS-only pipeline. Both the hls.js path (non-iOS) and the
 * native <video> path (iOS/Safari) load the SAME AES HLS master; each fetches the
 * AES-128 key directly from the manifest's #EXT-X-KEY URI (token baked in by the
 * per-request manifest rewrite). No separate key fetch / ClearKey is needed.
 */
export interface PlayerSource {
  /** Absolute AES-128 HLS master URL incl. ?token=. */
  hlsUrl: string;
  thumbnailsVttUrl?: string;
}

interface UseHlsPlayerResult {
  hls: Hls | null;
  isBuffering: boolean;
  error: PlayerError | null;
  retry: () => void;
}

/**
 * Owns the hls.js lifecycle for one <video> on non-iOS browsers (Chrome/Firefox/
 * Edge/Android). hls.js plays the AES-128 MPEG-TS HLS tree over MSE and decrypts
 * each segment via the browser Crypto API using the key from the #EXT-X-KEY URI.
 * iOS/Safari use the native path (useNativeHls) instead. StrictMode-safe: each
 * effect run owns its own Hls instance and destroys it on cleanup.
 */
export function useHlsPlayer(
  videoRef: RefObject<HTMLVideoElement>,
  source: PlayerSource | null
): UseHlsPlayerResult {
  const [hls, setHls] = useState<Hls | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<PlayerError | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  const url = source?.hlsUrl ?? "";
  const recoveredRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setError(null);
    setIsBuffering(true);
    recoveredRef.current = false;

    if (!Hls.isSupported()) {
      setError({ message: "This browser does not support the required media APIs.", isKeyAuth: false });
      return;
    }

    // hls.js runs on bare defaults otherwise; these options tune it for weak /
    // low-bandwidth regions: start low and ramp, cap to the visible player size,
    // buffer further ahead, bound memory, and stay patient on slow/flaky segment
    // loads. enableWorker + the default enableSoftwareAES stay on (AES-128 tree).
    const instance = new Hls({
      enableWorker: true,
      // Assume a low pipe until measured, so the first segment opens at the
      // lowest (240p) rung and playback starts fast even on 2G/3G, then ramps
      // up as testBandwidth (on by default) measures real throughput. Do NOT
      // use startLevel: 0 here: the master lists 1080p as level 0.
      abrEwmaDefaultEstimate: 300000,
      // Never fetch a rung larger than the on-screen <video>. On a phone-sized
      // player this alone avoids pulling the 720p/1080p ladder.
      capLevelToPlayerSize: true,
      // Hold a larger forward buffer so a brief network dip does not rebuffer
      // (segments are immutable + edge-cached, so refilling is cheap).
      maxBufferLength: 60,
      // Evict played media older than 90s to cap memory on low-RAM devices
      // (default is Infinity).
      backBufferLength: 90,
      // VOD tree: no low-latency-HLS behaviour needed.
      lowLatencyMode: false,
      // Segment loads: tolerate slow first-byte / slow links and retry more
      // before failing. Full default shape preserved; only the timeouts and the
      // error-retry count are raised.
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 20000,
          maxLoadTimeMs: 120000,
          timeoutRetry: {
            maxNumRetry: 3,
            retryDelayMs: 0,
            maxRetryDelayMs: 0,
          },
          errorRetry: {
            maxNumRetry: 8,
            retryDelayMs: 2000,
            maxRetryDelayMs: 15000,
            backoff: "linear",
          },
        },
      },
    });

    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);

    instance.on(Hls.Events.MEDIA_ATTACHED, () => instance.loadSource(url));
    instance.on(Hls.Events.MANIFEST_PARSED, () => setIsBuffering(false));
    instance.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      const status = data.response?.code;
      // A 401/403 on the manifest/key means the playback token expired/invalid.
      const isKeyAuth = status === 401 || status === 403;
      // One in-place media-error recovery (buffer/append glitches); after that, surface.
      if (!isKeyAuth && data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredRef.current) {
        recoveredRef.current = true;
        instance.recoverMediaError();
        return;
      }
      setError({
        code: status,
        message: isKeyAuth
          ? "Could not load the decryption key (the token may have expired)."
          : "Playback failed. The video may still be processing or unavailable.",
        isKeyAuth,
      });
    });

    instance.attachMedia(video);
    setHls(instance);

    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      setHls(null);
      instance.destroy();
      setIsBuffering(false);
      setError(null);
    };
  }, [url, retryNonce, videoRef]);

  return { hls, isBuffering, error, retry };
}
