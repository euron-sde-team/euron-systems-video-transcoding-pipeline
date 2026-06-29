import Hls from "hls.js";
import { useEffect, useState } from "react";

export interface QualityOption {
  height: number;
  label: string;
  /** Index into hls.levels; set hls.currentLevel = levelIndex to lock this rung. */
  levelIndex: number;
  active: boolean;
}

export interface TextTrackOption {
  /** Index into hls.subtitleTracks (== hls.subtitleTrack when selected). */
  id: number;
  label: string;
  language?: string;
  active: boolean;
}

export interface TrackInfo {
  qualities: QualityOption[];
  abrEnabled: boolean;
  textTracks: TextTrackOption[];
  textVisible: boolean;
}

/** Reads quality/caption tracks from hls.js and refreshes on its level/subtitle events. */
export function usePlayerTracks(hls: Hls | null): TrackInfo {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!hls) return;
    const bump = () => setNonce((n) => n + 1);
    const events = [
      Hls.Events.MANIFEST_PARSED,
      Hls.Events.LEVEL_SWITCHED,
      Hls.Events.LEVEL_LOADED,
      Hls.Events.SUBTITLE_TRACKS_UPDATED,
      Hls.Events.SUBTITLE_TRACK_SWITCH,
    ];
    events.forEach((e) => hls.on(e, bump));
    bump();
    return () => events.forEach((e) => hls.off(e, bump));
  }, [hls]);

  // nonce intentionally drives recomputation when hls.js fires track events.
  void nonce;

  if (!hls) {
    return { qualities: [], abrEnabled: true, textTracks: [], textVisible: false };
  }

  const levels = hls.levels ?? [];
  const current = hls.currentLevel; // -1 = auto / not yet known
  const activeHeight = current >= 0 && levels[current] ? levels[current].height : null;

  // Distinct heights, best (highest-bitrate) level per height, sorted high → low.
  const byHeight = new Map<number, QualityOption>();
  levels.forEach((lvl, i) => {
    if (!lvl.height) return;
    const existing = byHeight.get(lvl.height);
    if (!existing || (lvl.bitrate ?? 0) > (levels[existing.levelIndex].bitrate ?? 0)) {
      byHeight.set(lvl.height, {
        height: lvl.height,
        label: `${lvl.height}p`,
        levelIndex: i,
        active: lvl.height === activeHeight,
      });
    }
  });
  const qualities = Array.from(byHeight.values()).sort((a, b) => b.height - a.height);

  const subs = hls.subtitleTracks ?? [];
  const currentSub = hls.subtitleTrack; // index into subtitleTracks, -1 = none
  const textTracks: TextTrackOption[] = subs.map((s, i) => ({
    id: i,
    label: s.name || (s.lang ? s.lang.toUpperCase() : "") || "Subtitle",
    language: s.lang,
    active: i === currentSub,
  }));

  return {
    qualities,
    abrEnabled: hls.autoLevelEnabled,
    textTracks,
    textVisible: currentSub >= 0,
  };
}
