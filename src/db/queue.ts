import { sql, type Selectable } from "kysely";
import { ulid } from "ulid";
import { db } from "./connection";
import {
  COUNT_QUEUE_SQL,
  JOB_COUNT_SQL,
  JOB_REAP_SQL,
  JOB_RECONCILE_SQL,
  REAP_SQL,
} from "./queue-sql";
import type { video_jobs, videos } from "./types";

// Re-export so existing importers of db/queue keep working.
export { COUNT_QUEUE_SQL, JOB_COUNT_SQL, JOB_REAP_SQL, JOB_RECONCILE_SQL, REAP_SQL };

// Query RESULTS use Selectable, strips Kysely's Generated/ColumnType brands so
// fields read as plain string/number/Date.
export type VideoRow = Selectable<videos>;
export type VideoJobRow = Selectable<video_jobs>;

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

/** MARK READY: terminal success. `outputBytes` is the R2 output-tree footprint.
 * `durationSeconds` is the probed source duration (persisted so the Euron Systems
 * SaaS can show lecture duration like VdoCipher). */
export const markReady = async (
  id: string,
  workerId: string,
  captionsLangs: string[],
  outputBytes: number,
  durationSeconds: number
): Promise<void> => {
  await sql`
    UPDATE videos SET
      status='ready', stage=NULL, progress=100,
      captions_langs=${sql.val(captionsLangs)}, output_bytes=${outputBytes},
      duration_seconds=${Math.round(durationSeconds)}, error=NULL,
      ready_at=now(), updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/**
 * MARK READY + ENQUEUE background jobs (async-decoupling path, supersedes the
 * bare markReady for the worker). Flips the video to 'ready' the moment the HLS
 * tree is uploaded (playable now) AND, in the SAME transaction, seeds the
 * decoupled video_jobs rows for the remaining artifacts. Doing both atomically
 * means we never flip 'ready' without queueing the follow-up work, nor queue
 * work for a row we lost to the reaper. `captions_langs` stays [] until the
 * CAPTIONS job fills it; `captions_status`/`mp4_status` drive the SaaS UI.
 */
export const markReadyAndEnqueue = async (
  id: string,
  workerId: string,
  tenantId: string,
  outputBytes: number,
  durationSeconds: number,
  opts: { enqueueCaptions: boolean; enqueueDownload: boolean }
): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    const res = await sql`
      UPDATE videos SET
        status='ready', stage=NULL, progress=100,
        output_bytes=${outputBytes}, duration_seconds=${Math.round(durationSeconds)},
        captions_status=${opts.enqueueCaptions ? "pending" : "skipped"}::video_artifact_status,
        mp4_status=${opts.enqueueDownload ? "pending" : "skipped"}::video_artifact_status,
        error=NULL, ready_at=now(), updated_at=now()
      WHERE id=${id} AND locked_by=${workerId} AND status='processing'
    `.execute(trx);
    // Only seed jobs if we actually owned + flipped the row (reaper safety).
    if (Number(res.numAffectedRows ?? 0n) === 0) return;

    const kinds: Array<"CAPTIONS" | "DOWNLOAD"> = [];
    if (opts.enqueueCaptions) kinds.push("CAPTIONS");
    if (opts.enqueueDownload) kinds.push("DOWNLOAD");
    for (const kind of kinds) {
      await sql`
        INSERT INTO video_jobs (id, video_id, tenant_id, kind, status, created_at, updated_at)
        VALUES (${ulid()}, ${id}, ${tenantId}, ${kind}::video_job_kind, 'queued', now(), now())
      `.execute(trx);
    }
  });
};

// ─── video_jobs queue (CAPTIONS + DOWNLOAD) ──────────────────────────────────
// Same guarded-mutation contract as the video queue: every write is scoped by
// (locked_by, status='processing') so a reaped worker cannot clobber a job a
// new worker now owns.

/** CLAIM: one worker atomically grabs one 'queued' background job. Null if none.
 *  Jobs whose parent video was cancelled (lecture deleted, reconcile-retired) are
 *  never claimed: their artifacts would be garbage and could recreate R2 objects
 *  the cancelled-artifact sweep already reclaimed. The orchestrator also marks
 *  such jobs 'cancelled' (JOB_CANCEL_SQL); this guard covers the race window. */
export const claimNextJob = async (workerId: string): Promise<VideoJobRow | null> => {
  const result = await sql<VideoJobRow>`
    UPDATE video_jobs SET
      status='processing', locked_by=${workerId}, locked_at=now(), heartbeat_at=now(),
      attempts=attempts+1, updated_at=now()
    WHERE id = (
      SELECT j.id FROM video_jobs j
      WHERE j.status='queued'
        AND NOT EXISTS (
          SELECT 1 FROM videos v WHERE v.id = j.video_id AND v.status = 'cancelled'
        )
      ORDER BY j.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `.execute(db);
  return result.rows[0] ?? null;
};

/** HEARTBEAT: keep a claimed job alive so the 10-min reaper does not reclaim it.
 *  Also fails (0 rows) when the parent video was cancelled mid-job: the worker
 *  wires that to its AbortController, so a running captions/download job of a
 *  freshly cancelled video is SIGKILLed instead of finishing, re-uploading subs +
 *  master to a swept R2 prefix, and flipping artifact statuses on a dead video. */
export const jobHeartbeat = async (id: string, workerId: string): Promise<boolean> => {
  const result = await sql`
    UPDATE video_jobs SET heartbeat_at=now(), updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
      AND NOT EXISTS (
        SELECT 1 FROM videos v WHERE v.id = video_jobs.video_id AND v.status = 'cancelled'
      )
  `.execute(db);
  return Number(result.numAffectedRows ?? 0n) > 0;
};

/** RELEASE: Spot-interruption path, hand the job back to 'queued' WITHOUT penalty. */
export const releaseJobClaim = async (id: string, workerId: string): Promise<void> => {
  await sql`
    UPDATE video_jobs SET
      status='queued', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      attempts=attempts-1, updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** DONE: terminal success for one artifact. */
export const markJobDone = async (id: string, workerId: string): Promise<void> => {
  await sql`
    UPDATE video_jobs SET
      status='done', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      error=NULL, updated_at=now()
    WHERE id=${id} AND locked_by=${workerId} AND status='processing'
  `.execute(db);
};

/** FAIL or REQUEUE a background job. Past max_attempts → 'failed' AND flips the
 *  matching denormalized videos.*_status so the SaaS UI stops showing "preparing". */
export const failOrRequeueJob = async (
  job: VideoJobRow,
  workerId: string,
  errorMessage: string
): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    const res = await sql<{ status: string }>`
      UPDATE video_jobs SET
        status = (CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END)::video_job_status,
        locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
        error=${errorMessage}, updated_at=now()
      WHERE id=${job.id} AND locked_by=${workerId} AND status='processing'
      RETURNING status
    `.execute(trx);
    if (res.rows[0]?.status !== "failed") return;
    if (job.kind === "CAPTIONS") {
      await sql`UPDATE videos SET captions_status='failed'::video_artifact_status, updated_at=now() WHERE id=${job.video_id}`.execute(
        trx
      );
    } else {
      await sql`UPDATE videos SET mp4_status='failed'::video_artifact_status, updated_at=now() WHERE id=${job.video_id}`.execute(
        trx
      );
    }
  });
};

/** Mark an artifact as actively processing (optional UI nicety while a job runs). */
export const setArtifactProcessing = async (
  videoId: string,
  kind: "CAPTIONS" | "DOWNLOAD"
): Promise<void> => {
  if (kind === "CAPTIONS") {
    await sql`UPDATE videos SET captions_status='processing'::video_artifact_status, updated_at=now() WHERE id=${videoId} AND captions_status='pending'`.execute(
      db
    );
  } else {
    await sql`UPDATE videos SET mp4_status='processing'::video_artifact_status, updated_at=now() WHERE id=${videoId} AND mp4_status='pending'`.execute(
      db
    );
  }
};

/** CAPTIONS success: record the produced language(s) + flip status to ready. */
export const markCaptionsReady = async (videoId: string, langs: string[]): Promise<void> => {
  await sql`
    UPDATE videos SET
      captions_langs=${sql.val(langs)}, captions_status='ready'::video_artifact_status, updated_at=now()
    WHERE id=${videoId}
  `.execute(db);
};

/** DOWNLOAD success: flip the MP4 status to ready. */
export const markMp4Ready = async (videoId: string): Promise<void> => {
  await sql`
    UPDATE videos SET mp4_status='ready'::video_artifact_status, updated_at=now() WHERE id=${videoId}
  `.execute(db);
};

/** CAPTIONS no-op: source had no audio to transcribe (defensive; PRIMARY already
 *  gates enqueue on hasAudio). Marks skipped so the UI does not show "preparing". */
export const markCaptionsSkipped = async (videoId: string): Promise<void> => {
  await sql`
    UPDATE videos SET captions_status='skipped'::video_artifact_status, updated_at=now() WHERE id=${videoId}
  `.execute(db);
};

/** Reaper for the job queue (worker/API path). The Lambda uses JOB_REAP_SQL directly. */
export const reapStaleJobs = async (): Promise<number> => {
  const result = await sql.raw(JOB_REAP_SQL).execute(db);
  return Number(result.numAffectedRows ?? 0n);
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

/**
 * Cancelled videos still inside the artifact-sweep window: recent enough that R2
 * output objects may exist (or still land from a straggling upload), old enough
 * (15 min) that an in-flight abort has settled. Bounded to 7 days so the sweep
 * never scans deep history; within the window re-LISTing an already-swept (empty)
 * prefix is a cheap no-op. The worker sweeps these at startup and before idle
 * self-termination; R2 reclaim lives on workers because only they have R2 reach
 * (the orchestrator Lambda is in-VPC with no internet egress).
 */
export const listRecentCancelled = async (): Promise<
  Array<{ id: string; tenant_id: string; output_prefix: string | null }>
> => {
  const result = await sql<{
    id: string;
    tenant_id: string;
    output_prefix: string | null;
  }>`
    SELECT id, tenant_id, output_prefix FROM videos
    WHERE status='cancelled'
      AND updated_at BETWEEN now() - interval '7 days' AND now() - interval '15 minutes'
    ORDER BY updated_at DESC
    LIMIT 200
  `.execute(db);
  return result.rows;
};

/** Backlog size, scale-up signal. */
export const countUploaded = async (): Promise<number> => {
  const result = await sql<{ n: number }>`SELECT count(*)::int AS n FROM videos WHERE status='uploaded'`.execute(
    db
  );
  return result.rows[0]?.n ?? 0;
};
