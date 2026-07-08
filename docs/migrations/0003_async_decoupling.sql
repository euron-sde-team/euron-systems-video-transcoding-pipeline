-- 0003_async_decoupling.sql
-- Async decoupling of the transcode pipeline. The PRIMARY transcode now flips a
-- video to 'ready' the moment the AES-128 HLS tree is packaged + uploaded (playable
-- immediately), while captions and the downloadable MP4 are produced by decoupled,
-- independently-resumable video_jobs that run AFTER 'ready'. This migration adds:
--   1. the artifact-status enum + two denormalized columns the SaaS UI reads, and
--   2. the video_jobs queue the worker + orchestrator drive.
-- Applies to the SHARED DB (pipeline worker/orchestrator + the SaaS backends read
-- videos.*_status; only the pipeline models video_jobs). Developer-run: Claude never
-- executes migrations. Idempotent so it is safe to re-run.

-- 1. Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE video_artifact_status AS ENUM ('pending', 'processing', 'ready', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE video_job_kind AS ENUM ('CAPTIONS', 'DOWNLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE video_job_status AS ENUM ('queued', 'processing', 'done', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. videos: denormalized artifact status (SaaS UI reads these) ---------------
ALTER TABLE videos ADD COLUMN IF NOT EXISTS captions_status video_artifact_status NOT NULL DEFAULT 'pending';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS mp4_status      video_artifact_status NOT NULL DEFAULT 'pending';

-- 3. video_jobs: decoupled post-processing queue (one row per artifact) --------
CREATE TABLE IF NOT EXISTS video_jobs (
  id           text PRIMARY KEY,
  video_id     text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tenant_id    text NOT NULL,
  kind         video_job_kind NOT NULL,
  status       video_job_status NOT NULL DEFAULT 'queued',
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by    text,
  locked_at    timestamptz,
  heartbeat_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_jobs_status_kind_idx ON video_jobs (status, kind);
CREATE INDEX IF NOT EXISTS video_jobs_video_id_idx    ON video_jobs (video_id);

-- 4. Backfill existing rows so old 'ready' videos do NOT display "preparing" ----
-- Captions: a ready video already has its captions embedded in the manifest iff
-- captions_langs is non-empty; otherwise it never had captions (skipped).
UPDATE videos SET captions_status = 'ready'
  WHERE status = 'ready' AND captions_langs IS NOT NULL AND array_length(captions_langs, 1) >= 1;
UPDATE videos SET captions_status = 'skipped'
  WHERE status = 'ready' AND (captions_langs IS NULL OR array_length(captions_langs, 1) IS NULL);

-- MP4: download availability is verified by a live HeadObject at request time, so
-- mark existing ready videos 'ready' to preserve today's behavior (the presign stays
-- the final gate; old videos with no MP4 on R2 still 404 gracefully). New videos
-- start 'pending' (the column default) and the DOWNLOAD job flips them to 'ready'.
UPDATE videos SET mp4_status = 'ready' WHERE status = 'ready';

-- Non-'ready' videos keep the 'pending' default: when they next transcode via the
-- new path, markReadyAndEnqueue sets captions_status/mp4_status + seeds video_jobs.
