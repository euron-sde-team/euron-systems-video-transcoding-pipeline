import { Client } from "pg";
import config from "../config";
import {
  COUNT_QUEUE_SQL,
  JOB_CANCEL_SQL,
  JOB_COUNT_SQL,
  JOB_REAP_SQL,
  JOB_RECONCILE_SQL,
  REAP_SQL,
} from "../db/queue-sql";
import logger from "../utils/logger";
import { countRunningWorkers, jobsPool, launchWorkers, primaryPool } from "./ec2";

export interface OrchestratorResult {
  reaped: number;
  queued: number;
  inProgress: number;
  running: number;
  spare: number;
  toLaunch: number;
}

/**
 * One pg client PER INVOCATION, closed in finally. No module-scope pool, a
 * pool would leak connections across frozen/thawed Lambda containers
 * (constraint #12). Prefer the RDS Proxy endpoint via DATABASE_URL.
 */
const getClient = (): Client => {
  if (config.DATABASE_URL) return new Client({ connectionString: config.DATABASE_URL });
  return new Client({
    host: config.PG_DATABASE_HOST,
    user: config.PG_DATABASE_USER,
    password: config.PG_DATABASE_PASSWORD,
    port: Number(config.PG_DATABASE_PORT),
    database: config.PG_DATABASE,
  });
};

/**
 * EventBridge cron (every 1 min). Reap dead jobs, then scale UP only.
 *
 * Backlog now spans TWO queues: unclaimed PRIMARY videos ('uploaded') AND unclaimed
 * background artifact jobs ('queued' video_jobs: CAPTIONS + DOWNLOAD). A worker on
 * either counts as in_progress, so the SAME accounting holds once we sum both:
 *   queued     = uploadedVideos + queuedJobs
 *   inProgress = processingVideos + processingJobs
 *   need       = ceil(queued / DIVISOR)                // workers wanted for all backlog
 *   spare      = max(0, running - inProgress)          // workers not on a job
 *   toLaunch   = max(0, min(need - spare, MAX_WORKERS - running))
 * Background jobs thus provision workers when there is genuine backlog, and run in
 * parallel with each other and with new uploads up to MAX_WORKERS; DIVISOR is the
 * cost knob (raise it to reuse spare workers more and launch fewer). Workers claim
 * PRIMARY videos before jobs, so playback is never delayed by captions/MP4 work.
 *
 * Why 'processing' is NOT in the numerator: a processing video ALREADY has a worker,
 * so feeding it into the launch count (and subtracting all `running`) double-counts
 * and over-launches whenever `running` momentarily undercounts that worker, which it
 * does for ordinary reasons (the worker is still booting, its role tag is not yet
 * visible to DescribeInstances, or it was Spot-reclaimed before its job got reaped).
 * Provisioning off the queue and subtracting only SPARE workers is immune both ways:
 * an uncounted busy worker cannot inflate the launch (spare clamps at 0), and a busy
 * worker cannot suppress a needed launch (it is excluded from spare). With DIVISOR=1
 * this is one worker per queued video, capped by MAX_WORKERS. Never terminates
 * instances, workers self-terminate on an empty queue.
 */
export const handler = async (): Promise<OrchestratorResult> => {
  const db = getClient();
  await db.connect();
  try {
    // Reap both queues; reconcile the denormalized videos.*_status for any job the
    // reaper (not the worker) terminally failed, so the SaaS UI does not stick.
    const reapRes = await db.query(REAP_SQL);
    const jobReapRes = await db.query(JOB_REAP_SQL);
    await db.query(JOB_RECONCILE_SQL);
    // Retire queued jobs of cancelled parents BEFORE counting the backlog, so the
    // launch math never provisions workers for jobs claimNextJob refuses anyway.
    await db.query(JOB_CANCEL_SQL);
    const reaped = (reapRes.rowCount ?? 0) + (jobReapRes.rowCount ?? 0);

    const countRes = await db.query<{ queued: number; in_progress: number }>(COUNT_QUEUE_SQL);
    const jobCountRes = await db.query<{ queued: number; in_progress: number }>(JOB_COUNT_SQL);
    const videoQueued = countRes.rows[0]?.queued ?? 0;
    const videoInProgress = countRes.rows[0]?.in_progress ?? 0;
    const jobQueued = jobCountRes.rows[0]?.queued ?? 0;
    const jobInProgress = jobCountRes.rows[0]?.in_progress ?? 0;

    // Scale-up math for ONE pool: provision off the queue and subtract only SPARE
    // (running-not-busy) workers, capped at maxWorkers. `spare` clamps at 0 so an
    // uncounted busy worker (still booting / role tag not yet visible) can't inflate
    // the launch, and a busy worker can't suppress a needed launch (excluded from
    // spare). DIVISOR=1 => one worker per queued item.
    const plan = (q: number, inProg: number, running: number, maxW: number) => {
      const spare = Math.max(0, running - inProg);
      const need = Math.ceil(q / config.DIVISOR);
      const toLaunch = Math.max(0, Math.min(need - spare, Math.max(0, maxW - running)));
      return { spare, need, toLaunch };
    };

    if (config.JOBS_LAUNCH_TEMPLATE_NAME) {
      // TWO pools: big primary instances drain uploaded VIDEOS; a separate small pool
      // drains background video_jobs (captions/download). Each pool is counted by its
      // own role tag and launched from its own ladder + LT, so a small jobs instance
      // never picks up a heavy primary transcode and big instances aren't wasted on
      // whisper. Workers self-select via WORKER_MODE (set in each LT's UserData).
      const pRunning = await countRunningWorkers(config.WORKER_ROLE_TAG);
      const p = plan(videoQueued, videoInProgress, pRunning, config.MAX_WORKERS);
      const jRunning = await countRunningWorkers(config.JOBS_ROLE_TAG);
      const j = plan(jobQueued, jobInProgress, jRunning, config.JOBS_MAX_WORKERS);
      logger.info(
        `[orchestrator] reaped=${reaped} primary[q=${videoQueued} proc=${videoInProgress} ` +
          `run=${pRunning} launch=${p.toLaunch}] jobs[q=${jobQueued} proc=${jobInProgress} ` +
          `run=${jRunning} launch=${j.toLaunch}]`
      );
      if (p.toLaunch > 0) await launchWorkers(p.toLaunch, primaryPool());
      if (j.toLaunch > 0) await launchWorkers(j.toLaunch, jobsPool());
      return {
        reaped,
        queued: videoQueued + jobQueued,
        inProgress: videoInProgress + jobInProgress,
        running: pRunning + jRunning,
        spare: p.spare + j.spare,
        toLaunch: p.toLaunch + j.toLaunch,
      };
    }

    // SINGLE pool (no jobs pool configured): one fleet drains BOTH queues, workers
    // run WORKER_MODE=all (video first, then jobs). The legacy behaviour, unchanged.
    const queued = videoQueued + jobQueued;
    const inProgress = videoInProgress + jobInProgress;
    const running = await countRunningWorkers();
    const s = plan(queued, inProgress, running, config.MAX_WORKERS);

    logger.info(
      `[orchestrator] reaped=${reaped} queued=${queued}(v=${videoQueued},j=${jobQueued}) ` +
        `processing=${inProgress}(v=${videoInProgress},j=${jobInProgress}) ` +
        `running=${running} spare=${s.spare} need=${s.need} toLaunch=${s.toLaunch}`
    );

    if (s.toLaunch > 0) await launchWorkers(s.toLaunch, primaryPool());

    return { reaped, queued, inProgress, running, spare: s.spare, toLaunch: s.toLaunch };
  } finally {
    await db.end();
  }
};
