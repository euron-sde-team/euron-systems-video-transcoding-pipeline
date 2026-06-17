# Euron Systems, Self-Hosted Video Transcoding & Delivery Pipeline

Standalone VOD pipeline: large uploads → ABR ladder (FFmpeg) → **CMAF (fragmented MP4)** with a
**single segment set serving both HLS and DASH** → **AES-128 `cbcs` clear-key** → captions (whisper.cpp)
+ scrub-preview thumbnails → **Cloudflare R2 + CDN** → YouTube-like **Shaka Player** (16:9 and 9:16).

Compute runs on **EC2 Spot (Graviton)**, orchestrated by an **AWS Lambda cron**, with **PostgreSQL
as the only queue** (no SQS). Built to fold into the Euron Systems SaaS later; conventions mirror
`euron-systems-tenant-admin-backend` (Express 5 + Kysely + `prisma-kysely` + `pg`).

> `cbcs` is the exact scheme Widevine/FairPlay/PlayReady use, so a future DRM upgrade is a
> packager-flag change on the **same segments**, no re-encode. AES-128 clear-key today is
> **deterrence, not DRM** (a logged-in user with devtools can still capture the key).

## Three runtimes, one package
| Runtime | Entry | Role |
|---|---|---|
| **API** | `src/index.ts` (Node cluster) | uploads, complete, list/retry/cancel, playback-token mint, key delivery |
| **Worker** | `src/worker/index.ts` (EC2 Spot) | claim → ffprobe → ffmpeg ladder → whisper → shaka → R2 → ready; self-terminates |
| **Orchestrator** | `src/orchestrator/index.ts` (Lambda cron) | reap stale jobs + scale UP only (`DescribeInstances` count, `RunInstances`) |

Plus `player/` (framework-agnostic Shaka UI wrapper + demo) and `infra/` (AMI bootstrap, launch
template, IAM).

## Repo layout
```
prisma/schema.prisma         Kysely type source (prisma generate only, never migrate)
docs/migrations/0001_init.sql DEVELOPER-RUN DDL (enums + videos + video_keys + partial indexes)
src/
  config/                    centralized env
  db/        connection.ts (pg+Kysely, UTC parsers), queue.ts (FOR UPDATE SKIP LOCKED), queue-sql.ts
  errors/ middlewares/ utils/  error classes, auth (service key + playback token), asyncHandler, response, logger
  routes/ controllers/ services/ repositories/   videos + key + playback-token + content-key (KMS wrap)
  encoding/  probe, ladder, ffmpeg (single-decode multi-encode), thumbnails, captions, shaka
  worker/    loop, heartbeat, spot-interruption watcher, pipeline, r2 uploader, IMDS metadata
  orchestrator/  ec2 (describe/run), Lambda handler
player/  src/ (EuronVideoPlayer + watermark), demo/index.html
infra/   ami-bootstrap-dev.sh, ami-bootstrap-prod.sh, ami-build.md, launch-template.json, iam/*.json, README.md
```

## Dev quickstart

**Fully local, no cloud (recommended first):** see `docs/LOCAL.md` (Docker Postgres + MinIO, one
command to upload, one to play). The steps below are the manual/real-creds variant.

```bash
pnpm install
cp .env.example .env                 # fill in creds (DB, S3, R2, KMS) when ready
# developer applies the DDL once (Claude Code never runs migrations):
psql "$DATABASE_URL" -f docs/migrations/0001_init.sql
npx prisma generate                  # regenerate Kysely types after schema edits
pnpm dev                             # API on :4020
pnpm dev:worker                      # local worker (needs ffmpeg/packager/whisper on PATH)
pnpm build:player                    # bundle the player, then open player/demo/index.html
```

## HTTP API (`/api/v1`)
Management endpoints need `Authorization: Bearer <SERVICE_API_KEY>` + `X-Tenant-Id`.
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/videos/uploads` | service | presigned POST + create row (`uploading`) |
| POST | `/videos/:id/complete` | service | HeadObject verify → `uploaded` (ENQUEUE) |
| GET | `/videos` `?status&page&limit` | service | list (dashboard polling) |
| GET | `/videos/:id` | service | status/stage/progress + playback URLs when ready |
| POST | `/videos/:id/retry` | service | failed → uploaded |
| POST | `/videos/:id/cancel` | service | cancel pre-terminal |
| POST | `/videos/:id/playback-token` | service | mint short-TTL viewer token (after caller's enrollment check) |
| GET | `/videos/:id/key` `?token=` `[&format=raw]` | **playback token** | cbcs clear-key (JSON for Shaka, raw bytes for native HLS) |

## Integration seam (folding into the SaaS later)
The platform backend calls the management API service-to-service with tenant context, and mints
playback tokens **after its own enrollment check** (`POST /videos/:id/playback-token`, or by signing
the same HS256 claims directly with `PLAYBACK_TOKEN_SECRET`). The key endpoint's verification is
unchanged either way, only *who mints the token* moves.

## Verify
```bash
pnpm type-check && pnpm lint && pnpm build   # backend
pnpm build:player                            # player bundle
pnpm build:lambda                            # orchestrator bundle (dist-lambda/index.js)
```

See `IMPLEMENTATION_GUIDE.md` for the authoritative spec and `tasks/todo.md` for build status.
Acceptance criteria are in `IMPLEMENTATION_GUIDE.md §19`.
