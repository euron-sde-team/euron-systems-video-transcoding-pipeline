import { useEffect, useState } from "react";
import type { ShakaPlayer } from "./useShakaPlayer";

type VariantTrack = ReturnType<ShakaPlayer["getVariantTracks"]>[number];
type TextTrack = ReturnType<ShakaPlayer["getTextTracks"]>[number];

export interface QualityOption {
  height: number;
  label: string;
  track: VariantTrack;
  active: boolean;
}

export interface TrackInfo {
  qualities: QualityOption[];
  abrEnabled: boolean;
  textTracks: TextTrack[];
  textVisible: boolean;
}

/** Reads quality/caption tracks and refreshes on Shaka adaptation/track events. */
export function usePlayerTracks(player: ShakaPlayer | null): TrackInfo {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!player) return;
    const bump = () => setNonce((n) => n + 1);
    const events = ["adaptation", "variantchanged", "textchanged", "trackschanged", "loaded"];
    events.forEach((e) => player.addEventListener(e, bump));
    bump();
    return () => events.forEach((e) => player.removeEventListener(e, bump));
  }, [player]);

  // nonce intentionally drives recomputation when Shaka fires track events.
  void nonce;

  if (!player) {
    return { qualities: [], abrEnabled: true, textTracks: [], textVisible: false };
  }

  // Distinct video heights, best first. Mark the rung Shaka is currently playing.
  const byHeight = new Map<number, QualityOption>();
  for (const track of player.getVariantTracks()) {
    if (track.height == null) continue;
    const existing = byHeight.get(track.height);
    if (!existing || track.active) {
      byHeight.set(track.height, {
        height: track.height,
        label: `${track.height}p`,
        track,
        active: Boolean(track.active),
      });
    }
  }
  const qualities = Array.from(byHeight.values()).sort((a, b) => b.height - a.height);

  let abrEnabled = true;
  try {
    abrEnabled = Boolean(player.getConfiguration().abr?.enabled);
  } catch {
    /* default true */
  }

  return {
    qualities,
    abrEnabled,
    textTracks: player.getTextTracks(),
    textVisible: player.isTextTrackVisible(),
  };
}
