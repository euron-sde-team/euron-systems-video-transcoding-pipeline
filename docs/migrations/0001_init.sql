-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_init.sql, Euron Video Transcoding Pipeline (DEVELOPER-RUN)
--
-- This is the authoritative DDL. Claude Code never runs this; the developer
-- applies it manually against the dedicated Postgres database. It is kept in
-- sync by hand with prisma/schema.prisma (which is only used for Kysely type
-- generation). Idempotent where practical.
-- ─────────────────────────────────────────────────────────────────────────────

-- gen_random_uuid() lives in pgcrypto on older PG; built-in from PG 13+. Safe to run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE video_status    AS ENUM ('uploading','uploaded','processing','ready','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- only meaningful while status='processing'
  CREATE TYPE video_stage     AS ENUM ('transcoding','transcribing','packaging','uploading_output');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE protection_mode AS ENUM ('none','aes_128','drm_cbcs');   -- 'drm_cbcs' reserved for future
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE watermark_mode  AS ENUM ('none','dynamic_overlay','forensic_ab');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE orientation     AS ENUM ('landscape','portrait','square');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE key_wrap_scheme AS ENUM ('kms','local_aes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,

  status        video_status NOT NULL DEFAULT 'uploading',
  stage         video_stage,
  progress      smallint NOT NULL DEFAULT 0,           -- 0..100

  -- storage
  source_key    text,                                  -- S3 key of original
  source_bytes  bigint,
  output_prefix text,                                  -- R2 prefix: {tenant_id}/{id}
  orientation   orientation,                           -- set by worker via ffprobe

  -- protection / features (additive; defaults reflect "AES now, no DRM")
  protection    protection_mode NOT NULL DEFAULT 'aes_128',
  watermark     watermark_mode  NOT NULL DEFAULT 'dynamic_overlay',
  allow_offline boolean NOT NULL DEFAULT false,
  captions_langs text[] NOT NULL DEFAULT '{}',

  -- queue / claim mechanics
  locked_by     text,
  locked_at     timestamptz,                           -- absolute-timeout anchor (6h)
  heartbeat_at  timestamptz,                           -- stale-timeout anchor (10m)
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 3,

  -- flexible per-video pipeline knobs (ladder override, key ref, etc.)
  pipeline_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  ready_at      timestamptz
);

-- claim only scans 'uploaded'; reaper only scans 'processing' -> partial indexes stay tiny
CREATE INDEX IF NOT EXISTS idx_videos_uploaded   ON videos (created_at)   WHERE status = 'uploaded';
CREATE INDEX IF NOT EXISTS idx_videos_processing ON videos (heartbeat_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_videos_tenant     ON videos (tenant_id, created_at DESC);

-- Per-video content key (cbcs clear-key). Wrapped at rest (KMS in prod, local AES in dev).
CREATE TABLE IF NOT EXISTS video_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    uuid NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  kid_hex     text NOT NULL,                            -- 32 hex chars (16-byte key id)
  wrapped_key text NOT NULL,                            -- base64 of wrapped 16-byte content key
  wrap_scheme key_wrap_scheme NOT NULL DEFAULT 'kms',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_keys_tenant ON video_keys (tenant_id);
