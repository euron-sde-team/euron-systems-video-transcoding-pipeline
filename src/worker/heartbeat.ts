import config from "../config";
import { heartbeat } from "../db/queue";
import logger from "../utils/logger";

/**
 * Keeps `heartbeat_at` fresh during long ffmpeg/packager runs so the Lambda
 * reaper (10-minute stale window) doesn't reclaim a job that's actually
 * progressing. Also carries the current stage + progress for the dashboard.
 *
 * If a periodic heartbeat matches zero rows, this worker has LOST ownership
 * (reaper reclaimed it). We flag it; the final markReady/failOrRequeue is
 * (locked_by, status)-guarded anyway, so a lost claim simply no-ops at the end.
 */
export class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private stage = "transcoding";
  private progress = 0;
  private lost = false;

  constructor(
    private readonly videoId: string,
    private readonly workerId: string
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void heartbeat(this.videoId, this.workerId, this.stage, this.progress)
        .then((owned) => {
          if (!owned) {
            this.lost = true;
            logger.warn(`[heartbeat ${this.videoId}] lost ownership (reaped?)`);
          }
        })
        .catch((e) => logger.warn(`[heartbeat ${this.videoId}] ${e}`));
    }, config.HEARTBEAT_MS);
  }

  /** Set stage + progress at a stage boundary and persist immediately. */
  async update(stage: string, progress: number): Promise<void> {
    this.stage = stage;
    this.progress = progress;
    const owned = await heartbeat(this.videoId, this.workerId, stage, progress);
    if (!owned) this.lost = true;
  }

  get lostOwnership(): boolean {
    return this.lost;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
