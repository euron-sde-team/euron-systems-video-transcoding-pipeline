import cluster from "cluster";
import { Kysely, PostgresDialect } from "kysely";
import pg, { Pool, type PoolConfig } from "pg";
import config from "../config";
import logger from "../utils/logger";
import type { DB } from "./types";

// ─── Type coercion (READ + WRITE UTC safety) ─────────────────────────────────
// Force `timestamp without time zone` (oid 1114) to parse as UTC. Combined with
// `process.env.TZ = "UTC"` set at the top of each entry point, this prevents the
// classic offset shift where pg writes Dates in local time but reads them as UTC.
pg.types.setTypeParser(1114, (val: string) => new Date(val + "+00"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pg.defaults as any).parseInputDatesAsUTC = true;

// ─── Pool sizing ─────────────────────────────────────────────────────────────
// API runs under Node cluster (one pool per worker). The EC2 transcode worker is
// a single process and should run a SMALL pool (PG_POOL_MAX=2..4 via env) per the
// guide's connection-hygiene constraint. The Lambda orchestrator does NOT use
// this module, it opens one client per invocation (see src/orchestrator).
const getPoolConfig = (): PoolConfig => {
  const workerLabel = cluster.isWorker && cluster.worker ? `w${cluster.worker.id}` : "primary";
  const isProd = config.isProduction;

  return {
    host: config.PG_DATABASE_HOST,
    user: config.PG_DATABASE_USER,
    password: config.PG_DATABASE_PASSWORD,
    port: Number(config.PG_DATABASE_PORT),
    database: config.PG_DATABASE,
    application_name: `euron-vod-${workerLabel}-${process.pid}`,
    keepAlive: true,
    max: config.PG_POOL_MAX ? Number(config.PG_POOL_MAX) : isProd ? 8 : 10,
    min: config.PG_POOL_MIN ? Number(config.PG_POOL_MIN) : 0,
    connectionTimeoutMillis: config.PG_CONNECTION_TIMEOUT
      ? Number(config.PG_CONNECTION_TIMEOUT)
      : isProd
        ? 10000
        : 15000,
    idleTimeoutMillis: config.PG_IDLE_TIMEOUT
      ? Number(config.PG_IDLE_TIMEOUT)
      : isProd
        ? 10000
        : 5000,
    statement_timeout: 30000,
    // A transcode job can hold no open transaction for long, but guard anyway:
    // a leaked BEGIN must not pin a connection forever.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ idle_in_transaction_session_timeout: 60000 } as any),
  };
};

export const pool = new Pool(getPoolConfig());

pool.on("error", (err) => {
  logger.error(`[pg-pool] idle client error: ${err}`);
});

const dialect = new PostgresDialect({ pool });
export const db = new Kysely<DB>({ dialect });

/** Probe the DB on startup with exponential backoff (survives RDS failover). */
export const waitForDBConnection = async (attempts = 5, baseDelayMs = 500): Promise<void> => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        logger.info(i === 0 ? "Database connected" : `Database connected after ${i + 1} attempt(s)`);
        return;
      } finally {
        client.release();
      }
    } catch (error) {
      lastErr = error;
      const delay = baseDelayMs * Math.pow(2, i);
      logger.warn(
        `[pg-pool] connect attempt ${i + 1}/${attempts} failed (${(error as Error)?.message ?? error}); retrying in ${delay}ms`
      );
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.error(`[pg-pool] all connect attempts exhausted: ${lastErr}`);
  throw new Error("Database connection failed");
};

/** Gracefully drain the pool from SIGTERM/SIGINT handlers. */
export const closeDBConnection = async (): Promise<void> => {
  try {
    logger.info("Closing database connection pool...");
    await pool.end();
    logger.info("Database connection pool closed");
  } catch (error) {
    logger.error(`Error closing database connection pool: ${error}`);
  }
};
