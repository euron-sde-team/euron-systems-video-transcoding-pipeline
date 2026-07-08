// Raw queue SQL as plain strings. NO imports, so the Lambda orchestrator can
// reuse REAP_SQL/COUNT_QUEUE_SQL with its own per-invocation pg client WITHOUT
// pulling in db/connection's module-scope pool (Lambda connection hygiene,
// constraint #12).

/** Reclaim dead/stuck 'processing' jobs; give up past max_attempts. */
export const REAP_SQL = `
  UPDATE videos
  SET status = (CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'uploaded' END)::video_status,
      stage=NULL, locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      error = CASE WHEN attempts >= max_attempts THEN 'max attempts exceeded' ELSE error END,
      updated_at=now()
  WHERE status='processing'
    AND (heartbeat_at < now() - interval '10 minutes' OR locked_at < now() - interval '6 hours')
`;

/**
 * The two work buckets the scale-up controller needs, in ONE round trip:
 *   queued      = 'uploaded'   -> unclaimed, still needs a worker
 *   in_progress = 'processing' -> already claimed (each already has/had a worker)
 *
 * The controller launches for `queued` ONLY, offset by SPARE workers
 * (running - in_progress). Counting 'processing' INTO the launch numerator (the
 * earlier COUNT_OUTSTANDING approach) double-counts against `running` and over-
 * launches whenever a busy worker is momentarily uncounted (still booting, its role
 * tag not yet visible to DescribeInstances, or Spot-reclaimed before its job is
 * reaped). Provisioning off the queue is immune to that. See orchestrator/index.ts.
 */
export const COUNT_QUEUE_SQL = `
  SELECT
    count(*) FILTER (WHERE status = 'uploaded')::int   AS queued,
    count(*) FILTER (WHERE status = 'processing')::int AS in_progress
  FROM videos
  WHERE status IN ('uploaded', 'processing')
`;

// ─── Decoupled post-processing queue (video_jobs: CAPTIONS + DOWNLOAD) ────────
// Mirrors REAP_SQL/COUNT_QUEUE_SQL for the background artifact queue. Same raw-
// string contract so the Lambda orchestrator runs them with its own pg client.

/** Reclaim dead/stuck 'processing' jobs; give up past max_attempts. Independent
 *  per row, so requeuing the MP4 job never touches an already-done captions job. */
export const JOB_REAP_SQL = `
  UPDATE video_jobs
  SET status = (CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END)::video_job_status,
      locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
      error = CASE WHEN attempts >= max_attempts THEN 'max attempts exceeded' ELSE error END,
      updated_at=now()
  WHERE status='processing'
    AND (heartbeat_at < now() - interval '10 minutes' OR locked_at < now() - interval '6 hours')
`;

/** Backlog for the scale-up controller, one round trip:
 *    queued      = unclaimed jobs still needing a worker
 *    in_progress = claimed jobs (each already occupies a worker) */
export const JOB_COUNT_SQL = `
  SELECT
    count(*) FILTER (WHERE status = 'queued')::int     AS queued,
    count(*) FILTER (WHERE status = 'processing')::int AS in_progress
  FROM video_jobs
  WHERE status IN ('queued', 'processing')
`;

/** Reconcile the denormalized videos.*_status the SaaS UI reads when the REAPER
 *  (not the worker) terminally fails a job: worker-path failures already flip the
 *  column in failOrRequeueJob, but a reaper hard-fail must not leave the UI stuck
 *  on "preparing". Idempotent; two static statements run in one simple-protocol
 *  query. */
export const JOB_RECONCILE_SQL = `
  UPDATE videos v SET captions_status='failed'::video_artifact_status, updated_at=now()
    FROM video_jobs j
    WHERE j.video_id=v.id AND j.kind='CAPTIONS' AND j.status='failed'
      AND v.captions_status IN ('pending','processing');
  UPDATE videos v SET mp4_status='failed'::video_artifact_status, updated_at=now()
    FROM video_jobs j
    WHERE j.video_id=v.id AND j.kind='DOWNLOAD' AND j.status='failed'
      AND v.mp4_status IN ('pending','processing');
`;
