import { AlertTriangle, Loader2, Play, RotateCcw } from "lucide-react";
import type { PlayerError } from "./useHlsPlayer";

/** Centered buffering spinner. */
export function Spinner() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <Loader2 className="h-12 w-12 animate-spin text-white/90 drop-shadow" />
    </div>
  );
}

/** Big center play button shown while paused (and not at the very end). */
export function CenterPlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute inset-0 z-20 flex items-center justify-center"
      aria-label="Play"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform hover:scale-105">
        <Play className="ml-1 h-9 w-9 fill-current" />
      </span>
    </button>
  );
}

/** End-of-video replay button. */
export function ReplayOverlay({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/40"
      aria-label="Replay"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
        <RotateCcw className="h-7 w-7" />
      </span>
      <span className="text-sm font-medium text-white/90">Replay</span>
    </button>
  );
}

/** Fatal player error with a retry affordance. */
export function ErrorOverlay({ error, onRetry }: { error: PlayerError; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-rose-400" />
      <p className="max-w-sm text-sm text-gray-200">{error.message}</p>
      {error.code != null && (
        <p className="text-xs text-gray-500">Player error code {error.code}</p>
      )}
      <button
        onClick={onRetry}
        className="mt-1 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
      >
        <RotateCcw className="h-4 w-4" /> Retry
      </button>
    </div>
  );
}

/** Transient on-screen-display for keyboard/gesture actions ("10s", "Muted"). */
export function OsdToast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
      <span className="rounded-lg bg-black/70 px-4 py-2 text-base font-semibold text-white backdrop-blur">
        {text}
      </span>
    </div>
  );
}
