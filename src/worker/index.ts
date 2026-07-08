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
  markJobDone,
  markReadyAndEnqueue,
  releaseClaim,
  releaseJobClaim,
  type VideoJobRow,
  type VideoRow,
} from "../db/queue";
import logger from "../utils/logger";
import { Heartbeat } from "./heartbeat";
import { runCaptionsJob } from "./jobs/captions.job";
import { runDownloadJob } from "./jobs/download.job";
import { checkSpotInterruption, getInstanceId, logMetadataMode } from "./metadata";
import { runPrimary } from "./pipeline";

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
  const hb = new Heartbeat(video.id, WORKER_ID);
  hb.start();
  try {
    logger.info(`[worker] claimed video ${video.id} (attempt ${video.attempts}/${video.max_attempts})`);
    const outcome = await runPrimary(video, WORKER_ID, hb);
    hb.stop();
    await markReadyAndEnqueue(
      video.id,
      WORKER_ID,
      video.tenant_id,
      outcome.outputBytes,
      outcome.durationSec,
      { enqueueCaptions: outcome.enqueueCaptions, enqueueDownload: true }
    );
    logger.info(
      `[worker] ready ${video.id} (captions=${outcome.enqueueCaptions ? "queued" : "skipped"}, download queued)`
    );
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
  const timer = setInterval(() => {
    void jobHeartbeat(job.id, WORKER_ID).catch((e) => logger.warn(`[job-hb ${job.id}] ${e}`));
  }, config.HEARTBEAT_MS);
  try {
    logger.info(
      `[worker] claimed ${job.kind} job ${job.id} for video ${job.video_id} ` +
        `(attempt ${job.attempts}/${job.max_attempts})`
    );
    if (job.kind === "CAPTIONS") await runCaptionsJob(job);
    else await runDownloadJob(job);
    clearInterval(timer);
    await markJobDone(job.id, WORKER_ID);
    logger.info(`[worker] ${job.kind} job ${job.id} done`);
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
