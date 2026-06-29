import { type RefObject, useCallback, useEffect, useState } from "react";
import type { PlayerError } from "./useHlsPlayer";

/**
 * Native AES-128 HLS playback for iPhone/iPod, where hls.js's Managed-Media-Source
 * path is unreliable (hls.js's own docs recommend native HLS there). Safari plays
 * `METHOD=AES-128` HLS natively via a plain <video src>; these hooks own that path
 * while the VideoPlayer keeps rendering its own custom controls off the raw <video>.
 */

/**
 * Path selector: use the native <video> AES-128 HLS source ONLY on iPhone/iPod.
 *
 * Everything else — Chrome/Firefox/Edge/Android AND macOS Safari + iPadOS — routes to
 * hls.js (MSE). On macOS/iPadOS Safari this is DELIBERATE, not just a fallback: hls.js
 * feeds an in-memory blob to <video>, so Safari exposes no downloadable URL (no native
 * "Download Video"/"Copy Video Address" right-click). Native HLS, by contrast, hands
 * Safari a saveable m3u8 the viewer can download + replay (the leak we're closing). The
 * tradeoff is that hls.js on Safari is less battle-tested than native playback.
 *
 * iPhone/iPod is matched explicitly: every iOS browser is WebKit, so CriOS/FxiOS on
 * iPhone correctly stay native too. iPadOS reports a desktop "Macintosh" UA, so it
 * naturally falls into the hls.js branch (iPad Safari has full MSE).
 */
export function canPlayNativeHls(): boolean {
  const ua = navigator.userAgent;
  const isIPhone = /iPhone|iPod/.test(ua);
  if (!isIPhone) return false;
  const v = document.createElement("video");
  return v.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function nativeErrorMessage(code?: number): string {
  if (code === 2) return "A network error interrupted playback (the token may have expired).";
  if (code === 3) return "The video could not be decoded.";
  if (code === 4) return "The video could not be loaded (an expired token, 403, or CORS).";
  return "Playback failed. The video may still be processing or unavailable.";
}

interface UseNativeHlsResult {
  isBuffering: boolean;
  error: PlayerError | null;
}

/**
 * Drive a native HLS <video> from `url` (which already carries ?token=). Mirrors
 * useShakaPlayer's contract: surfaces buffering + a PlayerError (with isKeyAuth so
 * the existing retry path can re-mint the token on a 403).
 */
export function useNativeHls(
  videoRef: RefObject<HTMLVideoElement>,
  url: string | null
): UseNativeHlsResult {
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<PlayerError | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setError(null);
    setIsBuffering(true);

    const onError = () => {
      const code = video.error?.code;
      // A network / src-not-supported failure on a token-gated manifest or key is
      // almost always an expired/invalid token -> let the retry re-mint.
      const isKeyAuth = code === 2 || code === 4;
      setError({ code, message: nativeErrorMessage(code), isKeyAuth });
      setIsBuffering(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);

    video.addEventListener("error", onError);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);

    video.src = url;

    return () => {
      video.removeEventListener("error", onError);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeAttribute("src");
      video.load(); // detach the source so the next mount starts clean
      setIsBuffering(false);
      setError(null);
    };
  }, [url, videoRef]);

  return { isBuffering, error };
}

interface NativeTextTracks {
  available: boolean;
  on: boolean;
  toggle: () => void;
}

/**
 * Captions for the native path. The AES HLS master carries an EXT-X-MEDIA
 * SUBTITLES rendition, which Safari exposes as a `<video>` textTrack; toggle its
 * `mode` to show/hide. Only active while `enabled` (the native path is in use).
 */
export function useNativeTextTracks(
  videoRef: RefObject<HTMLVideoElement>,
  enabled: boolean
): NativeTextTracks {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) {
      setAvailable(false);
      setOn(false);
      return;
    }
    const tracks = video.textTracks;
    const sync = () => {
      let any = false;
      let showing = false;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === "subtitles" || t.kind === "captions") {
          any = true;
          if (t.mode === "showing") showing = true;
        }
      }
      setAvailable(any);
      setOn(showing);
    };
    sync();
    tracks.addEventListener("addtrack", sync);
    tracks.addEventListener("removetrack", sync);
    tracks.addEventListener("change", sync);
    return () => {
      tracks.removeEventListener("addtrack", sync);
      tracks.removeEventListener("removetrack", sync);
      tracks.removeEventListener("change", sync);
    };
  }, [videoRef, enabled]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    let target: TextTrack | null = null;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t.kind === "subtitles" || t.kind === "captions") {
        target = t;
        break;
      }
    }
    if (!target) return;
    if (target.mode === "showing") {
      target.mode = "disabled";
      setOn(false);
    } else {
      target.mode = "showing";
      setOn(true);
    }
  }, [videoRef]);

  return { available, on, toggle };
}
