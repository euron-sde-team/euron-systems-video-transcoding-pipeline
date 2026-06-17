import type { EuronPlayerConfig, ManifestType } from "./types";
import { Watermark } from "./watermark";

const MIME: Record<ManifestType, string> = {
  hls: "application/x-mpegurl",
  dash: "application/dash+xml",
};

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * YouTube-like player built on the Shaka Player UI library. One class for both
 * 16:9 and 9:16 content, orientation only swaps a CSS data-attribute; the UI
 * itself is responsive (compact control bar when narrow).
 *
 * Clear-key is fetched from the AUTHENTICATED key endpoint at start and injected
 * via drm.clearKeys. Reminder: clear-key is deterrence, not DRM.
 */
export class EuronVideoPlayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private shaka: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private player: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ui: any = null;
  private video: HTMLVideoElement | null = null;
  private watermark: Watermark | null = null;

  constructor(private readonly config: EuronPlayerConfig) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.shaka = config.shaka ?? (window as any).shaka;
    if (!this.shaka) {
      throw new Error("Shaka Player not found. Load shaka-player.ui.js or pass config.shaka.");
    }
  }

  private inferType(): ManifestType {
    if (this.config.manifestType) return this.config.manifestType;
    return this.config.manifestUrl.includes(".mpd") ? "dash" : "hls";
  }

   
  private async fetchClearKeys(): Promise<Record<string, string> | null> {
    if (!this.config.keyEndpoint) return null;
    const url = new URL(this.config.keyEndpoint, window.location.href);
    if (this.config.playbackToken) url.searchParams.set("token", this.config.playbackToken);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Key fetch failed: ${res.status}`);
    const body = await res.json();
    return body.clearKeys ?? null;
  }

  async load(): Promise<void> {
    this.shaka.polyfill.installAll();
    if (!this.shaka.Player.isBrowserSupported()) {
      throw new Error("Browser does not support the required media APIs");
    }

    const { container, orientation = "landscape", poster, thumbnailsVttUrl } = this.config;
    container.setAttribute("data-orientation", orientation);
    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.style.width = "100%";
    video.style.height = "100%";
    if (poster) video.poster = poster;
    container.appendChild(video);
    this.video = video;

    const player = new this.shaka.Player();
    await player.attach(video);
    this.player = player;

    // Clear-key (fetch before load so the keys are present when segments arrive).
    const clearKeys = await this.fetchClearKeys();

    player.configure({
      abr: {
        enabled: true,
        // Low initial estimate → fast start at a low rung, then ramp up.
        defaultBandwidthEstimate: 800_000,
      },
      streaming: {
        bufferingGoal: 30,
        rebufferingGoal: 2,
        bufferBehind: 30,
      },
      ...(clearKeys ? { drm: { clearKeys } } : {}),
    });

    // Shaka UI overlay (control bar, menus, spinner, keyboard shortcuts).
    const ui = new this.shaka.ui.Overlay(player, container, video);
    ui.configure({
      addSeekBar: true,
      controlPanelElements: [
        "play_pause",
        "time_and_duration",
        "spacer",
        "mute",
        "volume",
        "captions",
        "quality",
        "playback_rate",
        "picture_in_picture",
        "fullscreen",
      ],
      overflowMenuButtons: ["captions", "quality", "playback_rate", "picture_in_picture"],
      playbackRates: this.config.playbackRates ?? DEFAULT_RATES,
      seekBarColors: { base: "rgba(255,255,255,0.3)", buffered: "rgba(255,255,255,0.55)", played: "#ff4d4f" },
    });
    this.ui = ui;

    await player.load(this.config.manifestUrl, undefined, MIME[this.inferType()]);

    // Scrub-preview thumbnails (hover strip over the seek bar).
    if (thumbnailsVttUrl) {
      try {
        await player.addThumbnailsTrack(thumbnailsVttUrl, "text/vtt");
      } catch {
        /* non-fatal: previews just won't show */
      }
    }

    if (this.config.watermark) {
      this.watermark = new Watermark(container, this.config.watermark);
      this.watermark.start();
    }
  }

  async destroy(): Promise<void> {
    this.watermark?.stop();
    if (this.ui) await this.ui.destroy();
    if (this.player) await this.player.destroy();
    this.video?.remove();
    this.watermark = null;
    this.ui = null;
    this.player = null;
    this.video = null;
  }
}
