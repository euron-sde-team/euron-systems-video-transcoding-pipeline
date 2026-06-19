import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Orientation } from "../../types/api";
import { ControlBar } from "./ControlBar";
import {
  CenterPlayButton,
  ErrorOverlay,
  OsdToast,
  ReplayOverlay,
  Spinner,
} from "./PlayerOverlays";
import { useControlsAutoHide } from "./useControlsAutoHide";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { usePlaybackState } from "./usePlaybackState";
import { usePlayerTracks } from "./usePlayerTracks";
import { type PlayerSource, useShakaPlayer } from "./useShakaPlayer";
import { Watermark } from "./Watermark";

const ORIENTATION_CLASS: Record<Orientation, string> = {
  landscape: "aspect-video w-full",
  portrait: "mx-auto aspect-[9/16] h-[78vh] max-w-full",
  square: "mx-auto aspect-square max-h-[78vh]",
};

interface Props {
  source: PlayerSource;
  poster?: string;
  orientation?: Orientation;
  watermarkText?: string;
  /** Called when the key endpoint rejects the token, so the parent can re-mint. */
  onKeyAuthRetry?: () => void;
}

export function VideoPlayer({
  source,
  poster,
  orientation = "landscape",
  watermarkText,
  onKeyAuthRetry,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { player, isBuffering, error, thumbnailTrackId, retry } = useShakaPlayer(videoRef, source);
  const state = usePlaybackState(videoRef);
  const { textTracks, textVisible } = usePlayerTracks(player);

  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const [osd, setOsd] = useState<string | null>(null);

  const osdTimer = useRef<number | null>(null);
  const showOsd = useCallback((text: string) => {
    setOsd(text);
    if (osdTimer.current !== null) window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 700);
  }, []);

  const { visible, nudge } = useControlsAutoHide(
    !state.paused,
    state.paused || scrubbing || menuHover
  );

  // Apply playback rate to the element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, player]);

  // Track fullscreen changes (incl. ESC).
  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!player) return;
    if (player.isTextTrackVisible()) {
      player.setTextTrackVisibility(false);
      showOsd("Subtitles off");
    } else {
      const tracks = player.getTextTracks();
      if (tracks.length === 0) return;
      if (!tracks.some((t) => t.active)) player.selectTextTrack(tracks[0]);
      player.setTextTrackVisibility(true);
      showOsd("Subtitles on");
    }
  }, [player, showOsd]);

  useKeyboardShortcuts({
    videoRef,
    enabled: Boolean(player),
    onToggleFullscreen: toggleFullscreen,
    onToggleCaptions: toggleCaptions,
    showOsd,
  });

  // Surface gestures: single tap toggles play, double tap toggles fullscreen
  // (or seeks ±10s on the left/right third for touch).
  const tapRef = useRef<{ time: number; x: number } | null>(null);
  const singleTimer = useRef<number | null>(null);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const onSurfaceClick = (e: React.MouseEvent) => {
    const now = performance.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const width = rect?.width ?? 1;
    const prev = tapRef.current;

    if (prev && now - prev.time < 300) {
      // Double tap/click.
      if (singleTimer.current !== null) window.clearTimeout(singleTimer.current);
      tapRef.current = null;
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      if (isCoarse && x < width / 3) {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, v.currentTime - 10);
        showOsd("⏪ 10s");
      } else if (isCoarse && x > (width * 2) / 3) {
        const v = videoRef.current;
        if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
        showOsd("⏩ 10s");
      } else {
        toggleFullscreen();
      }
      return;
    }

    tapRef.current = { time: now, x };
    singleTimer.current = window.setTimeout(() => {
      togglePlay();
      tapRef.current = null;
    }, 260);
  };

  const showCenterPlay = state.paused && !state.ended && !isBuffering && !error;

  return (
    <div
      ref={containerRef}
      data-orientation={orientation}
      className={clsx(
        "relative overflow-hidden rounded-xl bg-black",
        !isFullscreen && ORIENTATION_CLASS[orientation],
        isFullscreen && "flex h-screen w-screen items-center justify-center rounded-none",
        visible ? "cursor-default" : "cursor-none"
      )}
      onPointerMove={nudge}
      onMouseLeave={() => !state.paused && nudge()}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        className="h-full w-full bg-black object-contain"
        onClick={onSurfaceClick}
      />

      {watermarkText && <Watermark text={watermarkText} />}

      {isBuffering && !error && <Spinner />}
      {showCenterPlay && <CenterPlayButton onClick={togglePlay} />}
      {state.ended && !error && (
        <ReplayOverlay
          onClick={() => {
            const v = videoRef.current;
            if (v) {
              v.currentTime = 0;
              void v.play();
            }
          }}
        />
      )}
      <OsdToast text={osd} />

      {error && (
        <ErrorOverlay
          error={error}
          onRetry={() => (error.isKeyAuth && onKeyAuthRetry ? onKeyAuthRetry() : retry())}
        />
      )}

      {/* Control bar (hidden via opacity so layout stays stable). */}
      <div
        className={clsx(
          "transition-opacity duration-200",
          visible || state.paused ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onPointerEnter={() => setMenuHover(true)}
        onPointerLeave={() => setMenuHover(false)}
      >
        {!error && (
          <ControlBar
            video={videoRef.current}
            player={player}
            state={state}
            thumbnailTrackId={thumbnailTrackId}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            captionsAvailable={textTracks.length > 0}
            captionsOn={textVisible}
            onToggleCaptions={toggleCaptions}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onScrubChange={setScrubbing}
          />
        )}
      </div>
    </div>
  );
}
