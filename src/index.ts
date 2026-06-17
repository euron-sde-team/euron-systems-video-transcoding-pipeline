// TZ MUST be set before any other import. pg serializes Date objects using local
// getters; without TZ=UTC, writes use local time while reads assume UTC (see the
// type parser in db/connection.ts), shifting every timestamp by the local offset.
process.env.TZ = "UTC";

import cluster from "cluster";
import os from "os";
import type { Server } from "http";
import app from "./app";
import config from "./config";
import { closeDBConnection, waitForDBConnection } from "./db/connection";
import logger from "./utils/logger";

const SHUTDOWN_TIMEOUT = 30000;

if (cluster.isPrimary) {
  const numCPUs = config.isProduction ? os.cpus().length : 1;
  logger.info(`[master ${process.pid}] starting ${numCPUs} worker(s)`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`[master] worker ${worker.process.pid} died (${signal || code}); forking replacement`);
    cluster.fork();
  });

  const shutdownMaster = (sig: string) => {
    logger.info(`[master] ${sig} received; shutting down workers`);
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill();
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT).unref();
  };
  process.on("SIGTERM", () => shutdownMaster("SIGTERM"));
  process.on("SIGINT", () => shutdownMaster("SIGINT"));
} else {
  void (async () => {
    process.on("unhandledRejection", (reason) => logger.error(`[worker] unhandledRejection: ${reason}`));
    process.on("uncaughtException", (err) => logger.error(`[worker] uncaughtException: ${err}`));

    await waitForDBConnection();

    const port = Number(config.PORT);
    const server: Server = app.listen(port, () => {
      logger.info(`[worker ${process.pid}] API listening on :${port} (${config.NODE_ENV})`);
    });

    const shutdown = async (sig: string) => {
      logger.info(`[worker ${process.pid}] ${sig} received; draining`);
      server.close(async () => {
        await closeDBConnection();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT).unref();
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  })();
}
