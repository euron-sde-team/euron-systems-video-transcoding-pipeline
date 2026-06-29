import { sql, type Selectable } from "kysely";
import { db } from "./connection";
import { COUNT_OUTSTANDING_SQL, REAP_SQL } from "./queue-sql";
import type { videos } from "./types";

// Re-export so existing importers of db/queue keep working.
export { COUNT_OUTSTANDING_SQL, REAP_SQL };

// Query RESULTS use Selectable, strips Kysely's Generated/ColumnType brands so
// fields read as plain string/number/Date.
export type VideoRow = Selectable<videos>;

/**
 * Postgres-as-queue. No SQS. All mutations are guarded by (locked_by, status)
 * so a worker that lost its claim to the reaper can never clobber a job another
 * worker now owns. The reaper SQL is also exported as a raw string because the
 * Lambda orchestrator runs it with its OWN per-invocation pg client (it must NOT
 * import this module's shared pool, Lambda connection-hygiene constraint).
 */

/** CLAIM: one worker atomically grabs one 'uploaded' video. Returns null if queue empty. */
export const claimNext = async (workerId: string): Promise<VideoRow | null> => {
  const result = await sql<VideoRow>`
    UPDATE videos SET
      status='processing', stage='transcoding',
      locked_by=${workerId}, locked_at=now(), heartbeat_at=now(),
      attempts=attempts+1, updated_at=now()
    WHERE id = (
      SELECT id FROM videos
      WHERE status='uploaded'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `.execute(db);
  return result.rows[0] ?? null;
};

/** HEARTBEAT: called every ~30s while processing. Updates stage + progress. Returns true if still owned. */
export const heartbeat = async (
  id: string,
  workerId: string,
  stage: string,
  progress: number
): Promise<boolean> => {
  const result = await sql`
    UPDATE videos SET heartbeat_at=now(), stage=${stage}::video_stage, progress=${progress}
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
  return Number(result.numAffectedRows ?? 0n) > 0;
};

/** Record orientation (from ffprobe) on the claimed row. */
export const setOrientation = async (
  id: string,
  workerId: string,
  orientation: string
): Promise<void> => {
  await sql`
    UPDATE videos SET orientation=${orientation}::orientation, updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** RELEASE: spot-interruption path, hand back WITHOUT penalising the video (undo the attempt++). */
export const releaseClaim = async (id: string, workerId: string): Promise<void> => {
  await sql`
    UPDATE videos SET
      status='uploaded', stage=NULL,
      locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      attempts=attempts-1, updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** MARK READY: terminal success. `outputBytes` is the R2 output-tree footprint. */
export const markReady = async (
  id: string,
  workerId: string,
  captionsLangs: string[],
  outputBytes: number
): Promise<void> => {
  await sql`
    UPDATE videos SET
      status='ready', stage=NULL, progress=100,
      captions_langs=${sql.val(captionsLangs)}, output_bytes=${outputBytes}, error=NULL,
      ready_at=now(), updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** FAIL or REQUEUE: a job threw. Past max_attempts → 'failed'; otherwise back to 'uploaded'. */
export const failOrRequeue = async (
  id: string,
  workerId: string,
  errorMessage: string
): Promise<void> => {
  await sql`
    UPDATE videos SET
      status = (CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'uploaded' END)::video_status,
      stage=NULL, locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      error=${errorMessage}, updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** Reaper for use inside this service (worker/API). The Lambda uses REAP_SQL directly. */
export const reapStale = async (): Promise<number> => {
  const result = await sql.raw(REAP_SQL).execute(db);
  return Number(result.numAffectedRows ?? 0n);
};

/** Backlog size, scale-up signal. */
export const countUploaded = async (): Promise<number> => {
  const result = await sql<{ n: number }>`SELECT count(*)::int AS n FROM videos WHERE status='uploaded'`.execute(
    db
  );
  return result.rows[0]?.n ?? 0;
};
