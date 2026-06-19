import clsx from "clsx";
import { Check, ChevronRight, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePlayerTracks } from "./usePlayerTracks";
import type { ShakaPlayer } from "./useShakaPlayer";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type View = "root" | "quality" | "speed" | "captions";

interface Props {
  player: ShakaPlayer | null;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
}

export function SettingsMenu({ player, playbackRate, onPlaybackRateChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("root");
  const rootRef = useRef<HTMLDivElement>(null);
  const { qualities, abrEnabled, textTracks, textVisible } = usePlayerTracks(player);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const activeHeight = qualities.find((q) => q.active)?.height ?? null;
  const activeText = textTracks.find((t) => t.active);
  const textLabel = (t: (typeof textTracks)[number]) =>
    t.label || t.language?.toUpperCase() || "Subtitle";

  const selectAuto = () => {
    player?.configure({ abr: { enabled: true } });
    setView("root");
  };
  const selectHeight = (q: (typeof qualities)[number]) => {
    player?.configure({ abr: { enabled: false } });
    player?.selectVariantTrack(q.track, true);
    setView("root");
  };
  const captionsOff = () => {
    player?.setTextTrackVisibility(false);
    setView("root");
  };
  const selectText = (t: (typeof textTracks)[number]) => {
    player?.selectTextTrack(t);
    player?.setTextTrackVisibility(true);
    setView("root");
  };

  const qualityValue = abrEnabled
    ? `Auto${activeHeight ? ` (${activeHeight}p)` : ""}`
    : activeHeight
      ? `${activeHeight}p`
      : "Auto";
  const speedValue = playbackRate === 1 ? "Normal" : `${playbackRate}x`;
  const captionsValue = textVisible && activeText ? textLabel(activeText) : "Off";

  const rowCls =
    "flex w-full items-center justify-between gap-6 rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10";
  const optionCls = "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-white/10";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setView("root");
        }}
        className={clsx(
          "flex h-9 w-9 items-center justify-center text-white/90 hover:text-white",
          open && "text-white"
        )}
        title="Settings"
      >
        <Settings className={clsx("h-5 w-5 transition-transform", open && "rotate-45")} />
      </button>

      {open && (
        <div className="absolute bottom-11 right-0 z-30 min-w-[220px] overflow-hidden rounded-lg border border-white/10 bg-black/90 py-1.5 shadow-xl backdrop-blur">
          {view === "root" && (
            <>
              <button className={rowCls} onClick={() => setView("quality")}>
                <span>Quality</span>
                <span className="flex items-center gap-1 text-gray-400">
                  {qualityValue} <ChevronRight className="h-4 w-4" />
                </span>
              </button>
              <button className={rowCls} onClick={() => setView("speed")}>
                <span>Playback speed</span>
                <span className="flex items-center gap-1 text-gray-400">
                  {speedValue} <ChevronRight className="h-4 w-4" />
                </span>
              </button>
              <button
                className={clsx(rowCls, textTracks.length === 0 && "cursor-not-allowed opacity-40")}
                onClick={() => textTracks.length > 0 && setView("captions")}
              >
                <span>Subtitles</span>
                <span className="flex items-center gap-1 text-gray-400">
                  {captionsValue} <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            </>
          )}

          {view === "quality" && (
            <Submenu title="Quality" onBack={() => setView("root")}>
              <button className={optionCls} onClick={selectAuto}>
                <Check className={clsx("h-4 w-4", abrEnabled ? "opacity-100" : "opacity-0")} />
                <span>
                  Auto{abrEnabled && activeHeight ? ` (${activeHeight}p)` : ""}
                </span>
              </button>
              {qualities.map((q) => (
                <button key={q.height} className={optionCls} onClick={() => selectHeight(q)}>
                  <Check
                    className={clsx(
                      "h-4 w-4",
                      !abrEnabled && q.active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{q.label}</span>
                </button>
              ))}
            </Submenu>
          )}

          {view === "speed" && (
            <Submenu title="Playback speed" onBack={() => setView("root")}>
              {SPEEDS.map((rate) => (
                <button
                  key={rate}
                  className={optionCls}
                  onClick={() => {
                    onPlaybackRateChange(rate);
                    setView("root");
                  }}
                >
                  <Check className={clsx("h-4 w-4", playbackRate === rate ? "opacity-100" : "opacity-0")} />
                  <span>{rate === 1 ? "Normal" : `${rate}x`}</span>
                </button>
              ))}
            </Submenu>
          )}

          {view === "captions" && (
            <Submenu title="Subtitles" onBack={() => setView("root")}>
              <button className={optionCls} onClick={captionsOff}>
                <Check className={clsx("h-4 w-4", !textVisible ? "opacity-100" : "opacity-0")} />
                <span>Off</span>
              </button>
              {textTracks.map((t, i) => (
                <button key={i} className={optionCls} onClick={() => selectText(t)}>
                  <Check
                    className={clsx(
                      "h-4 w-4",
                      textVisible && t.active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{textLabel(t)}</span>
                </button>
              ))}
            </Submenu>
          )}
        </div>
      )}
    </div>
  );
}

function Submenu({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left text-sm font-semibold text-gray-100 hover:bg-white/5"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        {title}
      </button>
      <div className="max-h-56 overflow-y-auto px-1">{children}</div>
    </div>
  );
}
