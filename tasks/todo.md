# Build Plan, Self-Hosted Video Transcoding & Delivery Pipeline

Standalone service. Separate Postgres DB. Will be folded into the Euron Systems SaaS later.
Conventions mirror `euron-systems-tenant-admin-backend` (Express 5 + Kysely + prisma-kysely + pg).

## Architecture decisions (standalone phase)
- **DB:** dedicated Postgres (creds added to `.env` later by developer).
- **IDs:** `uuid` columns (per guide §6), generated app-side with `crypto.randomUUID()`.
- **Migrations:** raw SQL in `docs/migrations/` (developer-run). `schema.prisma` is the
  source for Kysely type generation only (`npx prisma generate`). I never run migrate/push/DDL.
- **Auth:**
  - Management API (uploads/complete/list/retry) → service key (`Authorization: Bearer <SERVICE_API_KEY>`).
  - Playback/key endpoints → short-TTL signed playback JWT (accepted via header OR `?token=`
    so Apple native HLS `EXT-X-KEY` and Shaka both work). Minted by `POST /videos/:id/playback-token`
    (service-authed) after the platform's own enrollment check → "integration is a config change."
- **Worker / orchestrator / API** are separate entry points in one TS package (`src/worker`,
  `src/orchestrator`, `src/index.ts`). Player is a small bundled web module + demo page.

## Phases (build in order; each runnable/testable before the next)
- [x] 0. Foundation: package.json, tsconfig, eslint, prettier, gitignore, .env.example, README
- [x] 1. DB: schema.prisma (enums + videos + video_keys) + raw SQL migration + Kysely types + queue queries
- [x] 2. Shared core: config, db/connection, errors, utils (asyncHandler, response, logger), middlewares
- [x] 3. Upload API: POST /videos/uploads (presigned POST) + POST /videos/:id/complete (HeadObject verify)
- [x] 4. Management API: list/get/retry/cancel videos; status polling
- [x] 5. Worker skeleton: claim/heartbeat/release/self-terminate loop + spot-interruption watcher (stub pipeline)
- [x] 6. Encoding: ffprobe orientation + ladder templates + ffmpeg single-decode multi-output + thumbnails+sprite VTT
- [x] 7. Captions: whisper.cpp stage → en.vtt
- [x] 8. Packaging: Shaka Packager CMAF + cbcs clear-key + dual manifest + per-video key gen + KMS wrap
- [x] 9. R2 upload: push output tree under output_prefix; markReady
- [x] 10. Orchestrator Lambda: reap + scale-up (DescribeInstances count, RunInstances via Launch Template)
- [x] 11. Key endpoint: authed, authorized, short-TTL clear-key delivery
- [x] 12. Player: Shaka UI wrapper (ABR, quality, speed, captions, scrub thumbs, clear-key, watermark) + demo page
- [x] 13. Infra: AMI bootstrap + launch template + IAM policies + infra/ami-build.md
- [x] 14. Verify: backend tsc+lint+build ✓, player tsc+bundle ✓, lambda bundle ✓, prisma generate ✓

## ALL PHASES COMPLETE (standalone build)
What still requires the developer / real infra (cannot be done from here):
- Apply docs/migrations/0001_init.sql to the dedicated DB (Claude never runs migrations).
- Fill .env creds (DB, S3, R2, KMS) and the SSM params in infra/README.md.
- Build the ARM64 AMI (infra/ami-build.md) + create the launch template + IAM roles + EventBridge cron.
- End-to-end runtime test (upload → ready → play) needs ffmpeg/packager/whisper + real buckets.

## Known follow-ups (documented, intentionally deferred)
- Apple NATIVE HLS direct-play needs per-request manifest key-URI token injection (Shaka/MSE path
  works now via clearKeys). hlsKeyUri is baked only when PUBLIC_API_BASE is set.
- DRM / forensic watermark / secure offline: enum-stubbed, config-change upgrades (guide §20).

## Notes
- EC2→R2 egress is the cost watch-item: keep the ladder disciplined, no speculative rungs.
- cbcs (not legacy HLS AES-128); aligned keyframes via -force_key_frames expr; one decode many encodes.
- Lambda scales UP only; workers self-terminate. Count running workers from EC2, not a DB table.
- AES-128 clear-key is deterrence, NOT DRM, never call it DRM in code/UI.
