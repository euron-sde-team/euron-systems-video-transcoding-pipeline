// TZ before imports, pg serializes Dates with local getters; see db/connection.ts.
process.env.TZ = "UTC";

import { execSync } from "child_process";
import config from "../config";
import { closeDBConnection, waitForDBConnection } from "../db/connection";
import { claimNext, failOrRequeue, markReady, releaseClaim } from "../db/queue";
import logger from "../utils/logger";
import { Heartbeat } from "./heartbeat";
import { checkSpotInterruption, getInstanceId, logMetadataMode } from "./metadata";
import { transcodePipeline } from "./pipeline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let WORKER_ID = "";
let currentVideoId: string | null = null;
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

/** Spot-interruption / SIGTERM path: hand the claim back WITHOUT a penalty, then exit fast. */
const releaseAndExit = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("[worker] interruption/termination, releasing current claim");
  if (currentVideoId) {
    try {
      await releaseClaim(currentVideoId, WORKER_ID);
    } catch (e) {
      logger.error(`[worker] releaseClaim failed: ${e}`);
    }
  }
  process.exit(0);
};

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
    const video = await claimNext(WORKER_ID).catch((e) => {
      logger.error(`[worker] claim failed: ${e}`);
      return null;
    });

    if (!video) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince > config.IDLE_GRACE_MS) {
        logger.info(`[worker] idle ${config.IDLE_GRACE_MS}ms with empty queue, self-terminating`);
        clearInterval(watcher);
        selfTerminate();
      }
      await sleep(config.POLL_MS);
      continue;
    }

    idleSince = null;
    currentVideoId = video.id;
    const hb = new Heartbeat(video.id, WORKER_ID);
    hb.start();

    try {
      logger.info(`[worker] claimed ${video.id} (attempt ${video.attempts}/${video.max_attempts})`);
      const outcome = await transcodePipeline(video, WORKER_ID, hb);
      hb.stop();
      await markReady(
        video.id,
        WORKER_ID,
        outcome.captionsLangs,
        outcome.outputBytes,
        outcome.durationSec
      );
      logger.info(`[worker] ready ${video.id}`);
    } catch (err) {
      hb.stop();
      const msg = (err as Error).message ?? String(err);
      logger.error(`[worker] job ${video.id} failed: ${msg}`);
      await failOrRequeue(video.id, WORKER_ID, msg.slice(0, 1000)).catch((e) =>
        logger.error(`[worker] failOrRequeue failed: ${e}`)
      );
    } finally {
      currentVideoId = null;
    }
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
