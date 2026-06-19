import { useEffect, useRef, useState } from "react";

/**
 * Client-side, repositioning identity overlay (ported from the original
 * player/src/watermark.ts). Pure DOM, NO media changes: it jumps to a new
 * pseudo-random spot every few seconds so a static crop cannot remove it from
 * the whole timeline. Deterrence, not security.
 */
export function Watermark({
  text,
  intervalMs = 4000,
  opacity = 0.35,
}: {
  text: string;
  intervalMs?: number;
  opacity?: number;
}) {
  const seedRef = useRef<number>((text.length * 2654435761) % 2147483647 || 1);
  const [pos, setPos] = useState({ top: 8, left: 8 });

  useEffect(() => {
    const nextRandom = () => {
      let s = seedRef.current;
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      seedRef.current = s;
      return Math.abs(s % 1000) / 1000;
    };
    const reposition = () => setPos({ top: 5 + nextRandom() * 75, left: 5 + nextRandom() * 70 });
    reposition();
    const timer = window.setInterval(reposition, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return (
    <div
      className="pointer-events-none absolute z-30 select-none whitespace-nowrap text-white"
      style={{
        top: `${pos.top}%`,
        left: `${pos.left}%`,
        opacity,
        fontSize: "clamp(10px, 1.6vw, 14px)",
        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        transition: "top 0.6s ease, left 0.6s ease",
      }}
    >
      {text}
    </div>
  );
}
