import clsx from "clsx";
import {
  Captions,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
} from "lucide-react";
import { formatTime } from "../../lib/format";
import { SeekBar } from "./SeekBar";
import { SettingsMenu } from "./SettingsMenu";
import type { PlaybackState } from "./usePlaybackState";
import type { ShakaPlayer } from "./useShakaPlayer";
import { VolumeControl } from "./VolumeControl";

interface Props {
  video: HTMLVideoElement | null;
  player: ShakaPlayer | null;
  state: PlaybackState;
  thumbnailTrackId: number | null;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  captionsAvailable: boolean;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onScrubChange: (scrubbing: boolean) => void;
}

export function ControlBar({
  video,
  player,
  state,
  thumbnailTrackId,
  playbackRate,
  onPlaybackRateChange,
  captionsAvailable,
  captionsOn,
  onToggleCaptions,
  isFullscreen,
  onToggleFullscreen,
  onScrubChange,
}: Props) {
  const togglePlay = () => {
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const togglePip = async () => {
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* PiP can be blocked; ignore */
    }
  };

  const iconBtn = "flex h-9 w-9 items-center justify-center text-white/90 hover:text-white";

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-8"
      onClick={(e) => e.stopPropagation()}
    >
      <SeekBar
        currentTime={state.currentTime}
        duration={state.duration}
        buffered={state.buffered}
        player={player}
        thumbnailTrackId={thumbnailTrackId}
        onSeek={(t) => {
          if (video) video.currentTime = t;
        }}
        onScrubChange={onScrubChange}
      />

      <div className="mt-1 flex items-center gap-1">
        <button className={iconBtn} onClick={togglePlay} title={state.paused ? "Play (k)" : "Pause (k)"}>
          {state.paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
        </button>

        <VolumeControl
          volume={state.volume}
          muted={state.muted}
          onVolumeChange={(v) => {
            if (!video) return;
            video.volume = v;
            video.muted = v === 0;
          }}
          onToggleMute={() => {
            if (video) video.muted = !video.muted;
          }}
        />

        <span className="ml-1 select-none text-xs font-medium tabular-nums text-white/90">
          {formatTime(state.currentTime)} <span className="text-white/50">/ {formatTime(state.duration)}</span>
        </span>

        <div className="ml-auto flex items-center gap-1">
          {captionsAvailable && (
            <button
              className={clsx(iconBtn, captionsOn && "text-accent hover:text-accent")}
              onClick={onToggleCaptions}
              title="Subtitles (c)"
            >
              <Captions className="h-5 w-5" />
            </button>
          )}

          <SettingsMenu
            player={player}
            playbackRate={playbackRate}
            onPlaybackRateChange={onPlaybackRateChange}
          />

          {document.pictureInPictureEnabled && (
            <button className={iconBtn} onClick={togglePip} title="Picture in picture">
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}

          <button className={iconBtn} onClick={onToggleFullscreen} title="Fullscreen (f)">
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
