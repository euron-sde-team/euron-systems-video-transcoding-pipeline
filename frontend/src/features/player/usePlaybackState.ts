import { type RefObject, useEffect, useState } from "react";

export interface BufferedRange {
  start: number;
  end: number;
}

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  buffered: BufferedRange[];
}

/**
 * Mirrors the raw <video> element state into React. currentTime + buffered are
 * sampled on a rAF loop for a smooth seek bar; discrete events (play/pause/
 * volume/duration/ended) update the rest.
 */
export function usePlaybackState(videoRef: RefObject<HTMLVideoElement>): PlaybackState {
  const [state, setState] = useState<PlaybackState>({
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
    volume: 1,
    muted: false,
    buffered: [],
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;
    const readBuffered = (): BufferedRange[] => {
      const ranges: BufferedRange[] = [];
      for (let i = 0; i < video.buffered.length; i++) {
        ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) });
      }
      return ranges;
    };

    const tick = () => {
      setState((prev) => {
        const currentTime = video.currentTime;
        const buffered = readBuffered();
        // Avoid churn: only allocate a new object when something visible changed.
        if (
          Math.abs(prev.currentTime - currentTime) < 0.05 &&
          prev.buffered.length === buffered.length &&
          prev.buffered.every((r, i) => r.end === buffered[i].end && r.start === buffered[i].start)
        ) {
          return prev;
        }
        return { ...prev, currentTime, buffered };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const syncMeta = () =>
      setState((prev) => ({
        ...prev,
        duration: Number.isFinite(video.duration) ? video.duration : prev.duration,
        paused: video.paused,
        ended: video.ended,
        volume: video.volume,
        muted: video.muted,
      }));

    const events = ["play", "pause", "durationchange", "volumechange", "ended", "seeking", "seeked"];
    events.forEach((e) => video.addEventListener(e, syncMeta));
    syncMeta();

    return () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => video.removeEventListener(e, syncMeta));
    };
  }, [videoRef]);

  return state;
}
