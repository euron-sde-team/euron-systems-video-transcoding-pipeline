import { Client } from "pg";
import config from "../config";
import { COUNT_QUEUE_SQL, REAP_SQL } from "../db/queue-sql";
import logger from "../utils/logger";
import { countRunningWorkers, launchWorkers } from "./ec2";

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
 * Launch workers ONLY for the UNCLAIMED queue, crediting workers that are free to
 * take it (idle + still-booting):
 *   need     = ceil(queued / DIVISOR)                  // workers wanted for 'uploaded' videos
 *   spare    = max(0, running - inProgress)            // workers not on a job
 *   toLaunch = max(0, min(need - spare, MAX_WORKERS - running))
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
    const reapRes = await db.query(REAP_SQL);
    const reaped = reapRes.rowCount ?? 0;

    const countRes = await db.query<{ queued: number; in_progress: number }>(COUNT_QUEUE_SQL);
    const queued = countRes.rows[0]?.queued ?? 0;
    const inProgress = countRes.rows[0]?.in_progress ?? 0;

    const running = await countRunningWorkers();
    const spare = Math.max(0, running - inProgress);
    const need = Math.ceil(queued / config.DIVISOR);
    const headroom = Math.max(0, config.MAX_WORKERS - running);
    const toLaunch = Math.max(0, Math.min(need - spare, headroom));

    logger.info(
      `[orchestrator] reaped=${reaped} queued=${queued} processing=${inProgress} ` +
        `running=${running} spare=${spare} need=${need} toLaunch=${toLaunch}`
    );

    if (toLaunch > 0) await launchWorkers(toLaunch);

    return { reaped, queued, inProgress, running, spare, toLaunch };
  } finally {
    await db.end();
  }
};
