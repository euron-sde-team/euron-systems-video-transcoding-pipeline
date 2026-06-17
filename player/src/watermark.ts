export interface WatermarkOptions {
  /** Viewer identity to stamp (email / user id / "id · timestamp"). */
  text: string;
  /** Reposition interval in ms (default 4000). */
  intervalMs?: number;
  /** 0..1 (default 0.35). Visible enough to deter, faint enough not to ruin viewing. */
  opacity?: number;
}

/**
 * A client-side, repositioning identity overlay. Pure DOM, NO segment/media
 * changes (constraint #9: never burn a per-user watermark into the video). It
 * jumps to a new pseudo-random spot every few seconds so a static crop can't
 * remove it from the whole timeline.
 */
export class Watermark {
  private el: HTMLDivElement;
  private timer: number | null = null;
  private readonly intervalMs: number;
  // Deterministic-ish pseudo-random (no Math.random dependency on first paint).
  private seed: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: WatermarkOptions
  ) {
    this.intervalMs = opts.intervalMs ?? 4000;
    this.seed = (opts.text.length * 2654435761) % 2147483647 || 1;

    this.el = document.createElement("div");
    this.el.textContent = opts.text;
    Object.assign(this.el.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "30",
      color: "#ffffff",
      opacity: String(opts.opacity ?? 0.35),
      fontSize: "clamp(10px, 1.6vw, 14px)",
      fontFamily: "system-ui, sans-serif",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      whiteSpace: "nowrap",
      transition: "top 0.6s ease, left 0.6s ease",
      userSelect: "none",
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.el);
  }

  private nextRandom(): number {
    // xorshift-ish; keeps motion unpredictable without Math.random.
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return Math.abs(this.seed % 1000) / 1000;
  }

  private reposition(): void {
    // Keep within 5%..80% so the full text stays on-screen.
    const top = 5 + this.nextRandom() * 75;
    const left = 5 + this.nextRandom() * 70;
    this.el.style.top = `${top}%`;
    this.el.style.left = `${left}%`;
  }

  start(): void {
    this.reposition();
    this.timer = window.setInterval(() => this.reposition(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.el.remove();
  }
}
