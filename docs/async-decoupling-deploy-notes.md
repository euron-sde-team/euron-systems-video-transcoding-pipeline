# Async decoupling + speed levers: deploy notes (developer-run)

What changed (code, already landed):
- PRIMARY transcode flips `videos.status='ready'` the moment the AES-128 HLS tree is
  uploaded. Captions + the downloadable MP4 are now decoupled `video_jobs` that run
  AFTER ready, each independently claimed / heartbeated / reaped / Spot-released.
- New `videos.captions_status` / `videos.mp4_status` (`video_artifact_status`) drive
  the SaaS UI. New `video_jobs` queue (pipeline-owned).
- Worker: dual claim loop (PRIMARY first, then a background job), `runPrimary` +
  `src/worker/jobs/{captions,download}.job.ts`.
- Orchestrator: reaps + counts BOTH queues; `DIVISOR` is the cost/parallelism knob.
- Speed levers: `LADDER_PRESET` (x264 preset), `CAP_TO_SOURCE` + `CAP_TO_SOURCE_FACTOR`
  (cap rung bitrate to source), all SSM-tunable via the bootstrap.

## Order of operations (DEV first, then PROD)

1. Migration (developer): apply `docs/migrations/0003_async_decoupling.sql` to the
   shared DB (dev DB first). Idempotent. Adds enums + the two `videos` columns +
   `video_jobs` + backfill. Claude never runs this.

2. SaaS backends: `schema.prisma` already carries the two `videos` columns + the
   `video_artifact_status` enum in `euron-systems-schemas-repository`, tenant-admin,
   and user-server. Run `npx prisma generate` in tenant-admin + user-server, rebuild.

3. Re-bake the DEV worker AMI (SSH fast path per CLAUDE.md gotcha #5): git reset,
   `pnpm install`, `npx prisma generate`, `pnpm build`, `rsync -a --delete dist
   /opt/euron-vod/`, remove any `.env`, then **`sync; sync; sleep 2; sync`** and
   confirm `find dist -name '*.js' -size 0` is empty (gotcha #6), `create-image
   --no-reboot`, new LT version ($Latest). Keep the prior AMI for rollback.

4. SSM knobs (dev): recommended
   - `LADDER_PRESET=fast`
   - `CAP_TO_SOURCE=true`, `CAP_TO_SOURCE_FACTOR=1.1`
   (empty/absent → code defaults `medium` / on / 1.1). The bootstrap now pulls these.

5. Bigger instance (optional, B3): set the orchestrator Lambda env
   `WORKER_INSTANCE_TYPES=c7g.2xlarge,c7g.xlarge,...` and add a new LT version. This
   is a Lambda-env + LT change, NOT a worker bootstrap change.

6. Redeploy the DEV orchestrator Lambda (`scripts/deploy-lambda.sh`) so it reaps +
   counts `video_jobs`.

7. VALIDATE in dev (CLAUDE.md gotcha #2): a real worker CLAIMS a video (`attempts>0`)
   AND the two `video_jobs` rows appear + reach `done`; captions show in a fresh
   playback session; the download becomes available; a Spot claimback mid-DOWNLOAD
   requeues ONLY the DOWNLOAD row (CAPTIONS stays `done`).

8. PROD only after dev is green: copy AMI dev→prod, LT `$Latest` bump (keep old AMI),
   prod migration, prod Lambda, prod SSM. Roll back by moving `$Latest`, never
   `--default-version`.

## Notes
- Source is retained in the uploads bucket today (nothing deletes it), so the CAPTIONS
  and DOWNLOAD jobs can re-download it. Optional housekeeping: an S3 lifecycle expiry.
- `ready` is still gated on the FULL HLS tree upload, so "watchable" is never a lie.
  The initial master has no subtitle rendition (valid); the CAPTIONS job re-uploads
  master.m3u8 with subs (5-min manifest TTL → picked up on the next playback session).
