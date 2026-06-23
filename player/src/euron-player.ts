import type { EuronPlayerConfig, ManifestType } from "./types";
import { Watermark } from "./watermark";

const MIME: Record<ManifestType, string> = {
  hls: "application/x-mpegurl",
  dash: "application/dash+xml",
};

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * YouTube-like player. Two playback paths from ONE config:
 *  - MSE (Shaka): cbcs CMAF (DASH/HLS) + ClearKey, for Chrome/Firefox/Edge.
 *  - NATIVE (<video>): AES-128 HLS-TS, for Safari/iOS which lack ClearKey EME
 *    (they only have FairPlay). Picked automatically when ClearKey EME is absent.
 *
 * One class for both 16:9 and 9:16 content; orientation only swaps a CSS
 * data-attribute. Clear-key / AES-128 key delivery is deterrence, not DRM.
 */
export class EuronVideoPlayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private shaka: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private player: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ui: any = null;
  private video: HTMLVideoElement | null = null;
  private watermark: Watermark | null = null;

  // Shaka is resolved lazily (only the MSE path needs it), so the native Safari
  // path works on a page that never loaded shaka-player.
  constructor(private readonly config: EuronPlayerConfig) {}

  private inferType(): ManifestType {
    if (this.config.manifestType) return this.config.manifestType;
    return this.config.manifestUrl.includes(".mpd") ? "dash" : "hls";
  }

  /** Native HLS playback (Safari/iOS) is available? */
  private canPlayNativeHls(): boolean {
    const v = document.createElement("video");
    return v.canPlayType("application/vnd.apple.mpegurl") !== "";
  }

  /** Is W3C ClearKey EME usable (the cbcs/Shaka path's hard requirement)? */
  private async hasClearKeyEme(): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (typeof nav.requestMediaKeySystemAccess !== "function") return false;
    try {
      await nav.requestMediaKeySystemAccess("org.w3.clearkey", [
        {
          initDataTypes: ["cenc"],
          videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.640028"' }],
        },
      ]);
      return true;
    } catch {
      return false;
    }
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

  /**
   * Choose the path. Explicit `playbackMode` wins; otherwise use native AES-128
   * HLS when ClearKey EME is unavailable (Safari) and a native source exists,
   * else fall back to the Shaka/MSE cbcs path. No userAgent sniffing.
   */
  async load(): Promise<void> {
    const mode = this.config.playbackMode ?? "auto";
    if (mode === "native") return this.loadNative();
    if (mode === "mse") return this.loadMse();
    const emeOk = await this.hasClearKeyEme();
    if (!emeOk && this.config.hlsAesUrl && this.canPlayNativeHls()) return this.loadNative();
    return this.loadMse();
  }

  /** NATIVE Safari/iOS path: AES-128 HLS-TS via a plain <video> (no Shaka, no EME). */
  private loadNative(): void {
    const { container, orientation = "landscape", poster, hlsAesUrl } = this.config;
    if (!hlsAesUrl) throw new Error("hlsAesUrl is required for native playback");
    container.setAttribute("data-orientation", orientation);
    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.controls = true; // native control bar (incl. the CC button for captions)
    video.style.width = "100%";
    video.style.height = "100%";
    if (poster) video.poster = poster;

    const url = new URL(hlsAesUrl, window.location.href);
    if (this.config.playbackToken && !url.searchParams.has("token")) {
      url.searchParams.set("token", this.config.playbackToken);
    }
    video.src = url.toString();
    container.appendChild(video);
    this.video = video;

    if (this.config.watermark) {
      this.watermark = new Watermark(container, this.config.watermark);
      this.watermark.start();
    }
  }

  /** MSE path: Shaka Player + cbcs CMAF + ClearKey (Chrome/Firefox/Edge). */
  private async loadMse(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.shaka = this.config.shaka ?? (window as any).shaka;
    if (!this.shaka) {
      throw new Error("Shaka Player not found. Load shaka-player.ui.js or pass config.shaka.");
    }
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
