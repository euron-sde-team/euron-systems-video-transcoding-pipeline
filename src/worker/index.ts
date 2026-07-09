// TZ before imports, pg serializes Dates with local getters; see db/connection.ts.
process.env.TZ = "UTC";

import { execSync } from "child_process";
import config from "../config";
import { closeDBConnection, waitForDBConnection } from "../db/connection";
import {
  claimNext,
  claimNextJob,
  failOrRequeue,
  failOrRequeueJob,
  jobHeartbeat,
  listCancelledPage,
  markJobDone,
  markReadyAndEnqueue,
  releaseClaim,
  releaseJobClaim,
  type VideoJobRow,
  type VideoRow,
} from "../db/queue";
import { processedDownloadKey } from "../utils/const";
import logger from "../utils/logger";
import { Heartbeat } from "./heartbeat";
import { runCaptionsJob } from "./jobs/captions.job";
import { runDownloadJob } from "./jobs/download.job";
import { checkSpotInterruption, getInstanceId, logMetadataMode } from "./metadata";
import { runPrimary } from "./pipeline";
import { deleteVideoArtifacts } from "./r2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let WORKER_ID = "";
// What this worker currently holds, so the Spot/SIGTERM path hands back the RIGHT
// claim: a PRIMARY video (releaseClaim) or a background job (releaseJobClaim).
let currentClaim: { type: "video" | "job"; id: string } | null = null;
let shuttingDown = false;

/** Empty-queue path: launched with shutdown-behavior=terminate, so this ends the instance. */
const selfTerminate = (): never => {
  if (config.WORKER_DRY_RUN_SHUTDOWN) {
    logger.info("[worker] (dry-run) would run `sudo shutdown -h now`");
    process.exit(0);
  }
  try {
    execSync("sudo shutdown -h now");
  } catch (e) {
    logger.error(`[worker] shutdown failed: ${e}`);
  }
  process.exit(0);
};

/**
 * Reclaim R2 artifacts of recently cancelled videos: the public output tree
 * (HLS segments, manifests, thumbnails, captions) plus the private processed
 * MP4. Runs at startup (fire-and-forget) and before idle self-termination
 * (awaited), so the worker that just aborted a cancelled mid-transcode video
 * sweeps its own partial upload on the way out. Idempotent per video; the
 * SOURCE object is tenant-admin's cleanup job, not this one.
 */
async function sweepCancelledArtifacts(): Promise<void> {
  try {
    const PAGE = 200;
    // Keyset-drain the WHOLE 7-day window (no starvation on cancel bursts).
    let cursor = { updatedAt: new Date(0), id: "" };
    for (;;) {
      const rows = await listCancelledPage(cursor, PAGE);
      if (rows.length === 0) return;
      for (const row of rows) {
        if (shuttingDown) return;
        const prefix = row.output_prefix ?? `${row.tenant_id}/${row.id}`;
        try {
          await deleteVideoArtifacts(prefix, processedDownloadKey(row.tenant_id, row.id));
        } catch (e) {
          // Best-effort: a failed delete is retried on the next sweep in-window.
          logger.warn(`[worker] artifact sweep failed for cancelled video ${row.id}: ${e}`);
        }
      }
      const last = rows[rows.length - 1] as (typeof rows)[number];
      cursor = { updatedAt: last.updated_at, id: last.id };
      if (rows.length < PAGE) return;
    }
  } catch (e) {
    logger.warn(`[worker] artifact sweep query failed: ${e}`);
  }
}

/** Spot-interruption / SIGTERM path: hand the current claim back WITHOUT a penalty, then exit fast. */
const releaseAndExit = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("[worker] interruption/termination, releasing current claim");
  if (currentClaim) {
    try {
      if (currentClaim.type === "video") await releaseClaim(currentClaim.id, WORKER_ID);
      else await releaseJobClaim(currentClaim.id, WORKER_ID);
    } catch (e) {
      logger.error(`[worker] release failed: ${e}`);
    }
  }
  process.exit(0);
};

/** PRIMARY transcode: decode + ladder + package + upload, then flip READY + enqueue
 *  the CAPTIONS/DOWNLOAD background jobs (video is playable the moment READY lands). */
async function runVideo(video: VideoRow): Promise<void> {
  currentClaim = { type: "video", id: video.id };
  // Cooperative cancellation: when the heartbeat's guarded UPDATE hits 0 rows
  // (the claim was stolen by the reaper or an operator "mark failed"), it fires
  // onLost → ac.abort(), so runPrimary SIGKILLs any in-flight ffmpeg and bails
  // instead of finishing a transcode for a video this worker no longer owns.
  const ac = new AbortController();
  const hb = new Heartbeat(video.id, WORKER_ID, () => ac.abort());
  hb.start();
  try {
    logger.info(`[worker] claimed video ${video.id} (attempt ${video.attempts}/${video.max_attempts})`);
    const outcome = await runPrimary(video, WORKER_ID, hb, ac.signal);
    hb.stop();
    const flipped = await markReadyAndEnqueue(
      video.id,
      WORKER_ID,
      video.tenant_id,
      outcome.outputBytes,
      outcome.durationSec,
      { enqueueCaptions: outcome.enqueueCaptions, enqueueDownload: true }
    );
    if (flipped) {
      logger.info(
        `[worker] ready ${video.id} (captions=${outcome.enqueueCaptions ? "queued" : "skipped"}, download queued)`
      );
    } else {
      // Claim lost at the finish line (cancelled/reaped/re-claimed): the guarded
      // write no-oped, another actor's state wins. Log the truth, never "ready".
      logger.warn(`[worker] ready write no-oped for ${video.id} (claim lost at finish)`);
    }
  } catch (err) {
    hb.stop();
    const msg = (err as Error).message ?? String(err);
    logger.error(`[worker] video ${video.id} failed: ${msg}`);
    await failOrRequeue(video.id, WORKER_ID, msg.slice(0, 1000)).catch((e) =>
      logger.error(`[worker] failOrRequeue failed: ${e}`)
    );
  } finally {
    currentClaim = null;
  }
}

/** Background artifact (CAPTIONS or DOWNLOAD): independently claimed + heartbeated,
 *  so a Spot claimback requeues ONLY this job, never the already-done sibling. */
async function runBackgroundJob(job: VideoJobRow): Promise<void> {
  currentClaim = { type: "job", id: job.id };
  // Same cancellation contract as the PRIMARY path: a 0-row heartbeat (claim
  // stolen/reaped) aborts the job so we stop burning CPU on an artifact we no
  // longer own. A transient DB error is caught and does NOT abort (would else
  // kill a healthy encode on a blip); only a definitive not-owned result does.
  const ac = new AbortController();
  const timer = setInterval(() => {
    void jobHeartbeat(job.id, WORKER_ID)
      .then((owned) => {
        if (!owned) ac.abort();
      })
      .catch((e) => logger.warn(`[job-hb ${job.id}] ${e}`));
  }, config.HEARTBEAT_MS);
  try {
    logger.info(
      `[worker] claimed ${job.kind} job ${job.id} for video ${job.video_id} ` +
        `(attempt ${job.attempts}/${job.max_attempts})`
    );
    if (job.kind === "CAPTIONS") await runCaptionsJob(job, ac.signal);
    else await runDownloadJob(job, ac.signal);
    clearInterval(timer);
    const done = await markJobDone(job.id, WORKER_ID);
    if (done) logger.info(`[worker] ${job.kind} job ${job.id} done`);
    else logger.warn(`[worker] ${job.kind} job ${job.id} done-write no-oped (claim lost at finish)`);
  } catch (err) {
    clearInterval(timer);
    const msg = (err as Error).message ?? String(err);
    logger.error(`[worker] ${job.kind} job ${job.id} failed: ${msg}`);
    await failOrRequeueJob(job, WORKER_ID, msg.slice(0, 1000)).catch((e) =>
      logger.error(`[worker] failOrRequeueJob failed: ${e}`)
    );
  } finally {
    currentClaim = null;
  }
}

async function run(): Promise<void> {
  WORKER_ID = await getInstanceId();
  logMetadataMode(WORKER_ID);
  await waitForDBConnection();

  // Startup sweep, fire-and-forget so it never delays the first claim (playback
  // priority); the awaited pre-terminate sweep below is the reliable pass.
  void sweepCancelledArtifacts();

  const watcher = setInterval(() => {
    void checkSpotInterruption()
      .then((notice) => {
        if (notice) void releaseAndExit();
      })
      .catch(() => {});
  }, 5000);

  let idleSince: number | null = null;

  while (!shuttingDown) {
    // PRIMARY (playback path) has strict priority: only claim a background job when
    // no video is waiting, so time-to-watchable is never delayed by captions/MP4.
    const video = await claimNext(WORKER_ID).catch((e) => {
      logger.error(`[worker] claim failed: ${e}`);
      return null;
    });
    if (video) {
      idleSince = null;
      await runVideo(video);
      continue;
    }

    const job = await claimNextJob(WORKER_ID).catch((e) => {
      logger.error(`[worker] job claim failed: ${e}`);
      return null;
    });
    if (job) {
      idleSince = null;
      await runBackgroundJob(job);
      continue;
    }

    idleSince ??= Date.now();
    if (Date.now() - idleSince > config.IDLE_GRACE_MS) {
      logger.info(`[worker] idle ${config.IDLE_GRACE_MS}ms with empty queue, self-terminating`);
      clearInterval(watcher);
      // Final artifact sweep before the instance goes away: catches any video
      // cancelled during this worker's lifetime (including one it just aborted).
      // Deadline-capped: the R2 client has no request timeouts, and a hung socket
      // here (Spot watcher already stopped) would block self-termination forever;
      // the process exit below reaps any dangling sweep work.
      await Promise.race([sweepCancelledArtifacts(), sleep(5 * 60_000)]);
      selfTerminate();
    }
    await sleep(config.POLL_MS);
  }
}

process.on("SIGTERM", () => void releaseAndExit());
process.on("SIGINT", () => void releaseAndExit());
process.on("unhandledRejection", (r) => logger.error(`[worker] unhandledRejection: ${r}`));

run().catch(async (e) => {
  logger.error(`[worker] fatal: ${e}`);
  await closeDBConnection().catch(() => {});
  process.exit(1);
});
