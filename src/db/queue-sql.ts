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
