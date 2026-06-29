import { Client } from "pg";
import config from "../config";
import { COUNT_OUTSTANDING_SQL, REAP_SQL } from "../db/queue-sql";
import logger from "../utils/logger";
import { countRunningWorkers, launchWorkers } from "./ec2";

export interface OrchestratorResult {
  reaped: number;
  outstanding: number;
  running: number;
  desired: number;
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
 * EventBridge cron (every 1 min). The "brain": reap dead jobs, then scale UP only.
 *   outstanding = count(status IN ('uploaded','processing'))      // work that needs a worker
 *   desired     = min(MAX_WORKERS, ceil(outstanding / DIVISOR))   // DIVISOR = videos per worker
 *   toLaunch    = max(0, desired - running)
 * `outstanding` counts in-flight jobs so it shares units with `running` (all
 * workers, busy ones included); that stops a busy worker from being double-
 * subtracted from `desired`. With DIVISOR=1 this is one worker per outstanding
 * video, capped by MAX_WORKERS. Never terminates instances, workers self-terminate
 * on an empty queue.
 */
export const handler = async (): Promise<OrchestratorResult> => {
  const db = getClient();
  await db.connect();
  try {
    const reapRes = await db.query(REAP_SQL);
    const reaped = reapRes.rowCount ?? 0;

    const countRes = await db.query<{ n: number }>(COUNT_OUTSTANDING_SQL);
    const outstanding = countRes.rows[0]?.n ?? 0;

    const running = await countRunningWorkers();
    const desired = Math.min(config.MAX_WORKERS, Math.ceil(outstanding / config.DIVISOR));
    const toLaunch = Math.max(0, desired - running);

    logger.info(
      `[orchestrator] reaped=${reaped} outstanding=${outstanding} running=${running} ` +
        `desired=${desired} toLaunch=${toLaunch}`
    );

    if (toLaunch > 0) await launchWorkers(toLaunch);

    return { reaped, outstanding, running, desired, toLaunch };
  } finally {
    await db.end();
  }
};
