import { type RefObject, useEffect } from "react";

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  enabled: boolean;
  onToggleFullscreen: () => void;
  onToggleCaptions: () => void;
  showOsd: (text: string) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** YouTube-style keyboard shortcuts. Bound to window; ignores typing contexts. */
export function useKeyboardShortcuts({
  videoRef,
  enabled,
  onToggleFullscreen,
  onToggleCaptions,
  showOsd,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const video = videoRef.current;
      if (!video) return;

      const seekBy = (delta: number) => {
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
        showOsd(delta > 0 ? `⏩ ${Math.abs(delta)}s` : `⏪ ${Math.abs(delta)}s`);
      };
      const setVolume = (v: number) => {
        video.muted = false;
        video.volume = Math.max(0, Math.min(1, v));
        showOsd(`\u{1f50a} ${Math.round(video.volume * 100)}%`);
      };

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            void video.play();
            showOsd("▶");
          } else {
            video.pause();
            showOsd("⏸");
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(5);
          break;
        case "j":
          seekBy(-10);
          break;
        case "l":
          seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(video.volume + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(video.volume - 0.05);
          break;
        case "m":
          video.muted = !video.muted;
          showOsd(video.muted ? "\u{1f507} Muted" : "\u{1f50a} Unmuted");
          break;
        case "f":
          onToggleFullscreen();
          break;
        case "c":
          onToggleCaptions();
          break;
        case ",":
          video.pause();
          video.currentTime = Math.max(0, video.currentTime - 1 / 30);
          break;
        case ".":
          video.pause();
          video.currentTime = video.currentTime + 1 / 30;
          break;
        default:
          if (/^[0-9]$/.test(e.key) && video.duration) {
            video.currentTime = (Number(e.key) / 10) * video.duration;
            showOsd(`${Number(e.key) * 10}%`);
          }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, videoRef, onToggleFullscreen, onToggleCaptions, showOsd]);
}
