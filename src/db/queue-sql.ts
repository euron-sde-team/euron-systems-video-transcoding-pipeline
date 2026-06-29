// Raw queue SQL as plain strings. NO imports, so the Lambda orchestrator can
// reuse REAP_SQL/COUNT_OUTSTANDING_SQL with its own per-invocation pg client
// WITHOUT pulling in db/connection's module-scope pool (Lambda connection
// hygiene, constraint #12).

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
 * Outstanding work = the scale-up signal. Counts videos that still need a worker
 * slot: 'uploaded' (waiting for one) + 'processing' (already have one). Counting
 * BOTH keeps this numerator in the SAME unit as `running` (all workers, busy ones
 * included), so a busy worker is not double-subtracted from `desired`. Scaling on
 * 'uploaded' alone undercounted: a claimed job leaves the queue while its worker
 * still counts as running, so each busy worker suppressed DIVISOR items before the
 * next launch (supersedes the old 'uploaded'-only signal).
 */
export const COUNT_OUTSTANDING_SQL =
  "SELECT count(*)::int AS n FROM videos WHERE status IN ('uploaded','processing')";
