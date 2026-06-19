import { Volume1, Volume2, VolumeX } from "lucide-react";

interface Props {
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}

/** Mute toggle + a slider that expands on hover (YouTube-style). */
export function VolumeControl({ volume, muted, onVolumeChange, onToggleMute }: Props) {
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;

  return (
    <div className="group/vol flex items-center">
      <button
        onClick={onToggleMute}
        className="flex h-9 w-9 items-center justify-center text-white/90 hover:text-white"
        title={muted ? "Unmute (m)" : "Mute (m)"}
      >
        <Icon className="h-5 w-5" />
      </button>
      <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/vol:w-20">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={effective}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="h-1 w-20 accent-white"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
