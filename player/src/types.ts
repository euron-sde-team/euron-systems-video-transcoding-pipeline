import type { WatermarkOptions } from "./watermark";

export type ManifestType = "hls" | "dash";
export type PlayerOrientation = "landscape" | "portrait" | "square";

export interface EuronPlayerConfig {
  /** Wrapper element the player + UI + watermark mount into (must be position:relative). */
  container: HTMLElement;
  /** HLS master.m3u8 or DASH manifest.mpd (CDN URL). */
  manifestUrl: string;
  /** Inferred from the URL extension if omitted. */
  manifestType?: ManifestType;
  orientation?: PlayerOrientation;
  poster?: string;
  /** Scrub-preview WebVTT (thumbnails.vtt), enables hover previews on the seek bar. */
  thumbnailsVttUrl?: string;

  /** Clear-key delivery. The endpoint returns { clearKeys: { kidHex: keyHex } }. */
  keyEndpoint?: string;
  /** Short-TTL playback token; sent as `?token=` so it works for the key fetch. */
  playbackToken?: string;

  /** Dynamic identity overlay (NOT burned into media). */
  watermark?: WatermarkOptions;

  /** Override the global `shaka` (e.g. when bundling shaka-player in a host app). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shaka?: any;

  /** Playback speeds for the speed menu. */
  playbackRates?: number[];
}
