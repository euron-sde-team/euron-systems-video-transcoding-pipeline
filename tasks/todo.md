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

---

# Durable multi-AZ orchestrator (June 2026) — kill single-AZ Spot ICE forever

**Problem:** orchestrator `launchWorkers` used `RunInstances` with ONE `SubnetId` + `MarketType:spot`.
One subnet = one AZ = one Spot pool. When that pool is dry → `InsufficientInstanceCapacity` →
the whole launch fails and the backlog stalls (hit twice: 1a exhausted, then 1b).

**Fix:** switch the launch to `CreateFleet` (type `instant`):
- fan out across ALL THREE subnets (one per AZ) × instance types as fleet `Overrides`
- `SpotOptions.AllocationStrategy = capacity-optimized` (provision from the deepest pool)
- On-Demand fallback for any shortfall (`DefaultTargetCapacityType: on-demand` second call)
- tag instances from the Lambda (authoritative per-env `role` tag) so the counter still sees them

## Verified facts (read-only discovery, both accounts)
- PROD VPC `10.0.0.0/16`; 3 public subnets 1a/1b/1c IDENTICAL routes: `0.0.0.0/0→igw`,
  `172.30.0.0/16→pcx-0331998398156fbed` (cross-account RDS peering). All `MapPublicIpOnLaunch=false`
  → public IP comes from the LT NetworkInterface (`AssociatePublicIpAddress:true`).
  - 1a `subnet-0926c3bd9080f8d6d`, 1b `subnet-0fcc382be21a0d5c0`, 1c `subnet-0eea0cf4bd426b3b1`
- DEV default VPC `172.31.0.0/16`; 3 subnets 1a/1b/1c all `MapPublicIpOnLaunch=true` (auto public IP,
  no NI). Dev RDS `euronpgdev2` is in the SAME VPC + SAME SG `sg-0099bff1ff1b348e4` as workers.
  - 1a `subnet-0b5f7c3746fa158d5`, 1b `subnet-0ec2a4406c65c3fa0`, 1c `subnet-0ceb848970d187a60`

## Two CreateFleet constraints → both LTs need a new version
1. Fleet subnet `Overrides` CONFLICT with a subnet baked in the LT NetworkInterface → PROD NI must
   keep `AssociatePublicIpAddress` but DROP `SubnetId`.
2. LT must NOT hardcode `InstanceMarketOptions` (fleet's `DefaultTargetCapacityType` controls
   spot-vs-on-demand; a baked `spot` breaks the on-demand fallback call) → remove from BOTH LTs.
   DEV LT also gains the `role=transcoder-dev` instance tag (prod LT already has it).

## Steps
- [x] Code: `src/orchestrator/ec2.ts` → CreateFleet (instant) + capacity-optimized + CreateTags
- [x] Code: `src/config/index.ts` → `WORKER_SUBNET_IDS`, `WORKER_INSTANCE_TYPES`,
      `SPOT_ALLOCATION_STRATEGY`, `ONDEMAND_FALLBACK` (csv helpers, back-compat fallbacks)
- [x] IAM: add `ec2:CreateFleet` to `infra/iam/lambda-policy.json` + both orchestrator roles (simulated allowed)
- [x] Docs: DEPLOYMENT.md (LT step + Lambda env), TROUBLESHOOTING.md, launch-template.json, .env.example
- [x] type-check + lint + build:lambda (clean)
- [x] DEV deploy: IAM → LT v7 (drop InstanceMarketOptions + role tag, default) → env
      (`WORKER_SUBNET_IDS` 3 AZ + `WORKER_INSTANCE_TYPES` c7g/c6g/m7g) → code → invoke clean
- [x] PROD deploy: IAM → disable cron → LT v5 (drop InstanceMarketOptions + NI subnet, default) → env
      → code → invoke → **PROVEN**: fleet fanned out 3 AZs (all Spot dry), launched in 1c w/ public IP
      + role tag, worker booted/reached DB/self-terminated → re-enabled cron
- [x] **AMENDMENT (user): Spot-ONLY, no On-Demand.** `ONDEMAND_FALLBACK` default flipped to false +
      env set false on both Lambdas. Dry Spot → launch 0, video stays queued, cron retries. No OD spend.
- [x] Update memory (vod-worker-deploy-gotchas / vod-prod-deployment)
- [ ] **Flag for Raushan: ROTATE the pasted dev + prod AWS keys (exposed in transcript).**

## Rollback anchors (old-good)
- PROD LT v4 (NI subnet 1b + InstanceMarketOptions spot); DEV LT v6. Orchestrator uses `$Latest`, so
  rollback = create a new version copying v4/v6 + revert the Lambda code (RunInstances) + unset env.

---

# DASH static-MPD fix (June 2026) — the original `1193046:28:16` (~2^32 s) bug

**Root cause (empirically confirmed from the live MPD, NOT the ffmpeg `-t` theory):** Shaka Packager,
given `segment_template`+`$Number$` (segmented output), DEFAULTS to a LIVE manifest: `type="dynamic"`,
`profiles=isoff-live`, `availabilityStartTime`/`minimumUpdatePeriod`/`timeShiftBufferDepth`, and NO
`mediaPresentationDuration`. Players treat finite VOD as a live edge → invent ~2^32 s duration, won't
seek/play. Segments + SegmentTimeline were always correct; HLS always worked.

**Fix:** add `--generate_static_live_mpd` to `src/encoding/shaka.ts`. Proven on the builder (packager
v3.2.0): no flag → `type="dynamic"` (no duration); flag → `type="static"` + `mediaPresentationDuration`.
Also corrected the misleading `-t` comment in `src/encoding/ffmpeg.ts` (kept `-t` as defensive bounding).

**Deploy (worker code = AMI re-bake), done both envs:**
- [x] Code fix + build; flag in `dist/encoding/shaka.js`.
- [x] Ship fixed `dist/` to dev builder `/opt/euron-vod/dist` (rsync over SSH) → sync.
- [x] `create-image` WITH reboot (FS flush) → dev AMI `ami-0d0374082ffda8d83`; verified baked dist via
      throwaway launch (flag=1, sizes non-zero), terminated.
- [x] Dev LT v8 → new AMI (default). Shared AMI+snap to prod; `copy-image` → prod AMI
      `ami-0a26356bcec16a015`. Prod LT v6 → new AMI (default).
- [x] Re-transcode E3 (`276ab1ec...`): reset row to `uploaded`; orchestrator launched fixed worker
      (c6g.xlarge spot, c7g was dry → tiering fell back), reprocessing... (verify static MPD)
- [x] Stopped dev builder.
- Reference doc: `docs/orchestrator-spot-and-dash-fixes.md`.

## As-built (June 2026)
- PROD: LT `euron-vod-prod-worker-template` v5 default; Lambda `euron-vod-orchestrator-prod` env
  `WORKER_SUBNET_IDS=subnet-0926c3bd9080f8d6d,subnet-0fcc382be21a0d5c0,subnet-0eea0cf4bd426b3b1`,
  `WORKER_INSTANCE_TYPES=c7g.xlarge,c6g.xlarge,m7g.xlarge`, `ONDEMAND_FALLBACK=false`.
- DEV: LT `euron-vod-dev-worker-template` v7 default; Lambda env
  `WORKER_SUBNET_IDS=subnet-0b5f7c3746fa158d5,subnet-0ec2a4406c65c3fa0,subnet-0ceb848970d187a60`,
  same types + `ONDEMAND_FALLBACK=false`. (Dev CreateFleet path not exercised by a real backlog;
  identical code proven in prod. Full dev E2E needs a test upload.)

---

# Safari AES-128 HLS + ABR trim + processed download + captions fix (June 2026, commit eee439c)

Four changes shipped together (see `docs/safari-aes-hls-and-pipeline-improvements.md`):
- [x] **Safari AES-128 HLS-TS** (`src/encoding/hls-aes.ts`): additive parallel tree, METHOD=AES-128 over
      MPEG-TS, remuxed `-c copy` from existing rungs, same content key (key file kept OUT of outputDir).
      Native-Safari captions via an `EXT-X-MEDIA:SUBTITLES` rendition (`X-TIMESTAMP-MAP`, PTS 0).
- [x] **API token injection** (`hls.controller.ts` + `r2-read.service.ts`): serve + rewrite the AES
      master/variant per request (token into key+variant URIs, segments→CDN); `no-store`.
- [x] **Player** (`euron-player.ts`): auto native `<video>` AES path when ClearKey EME absent; Shaka path
      unchanged. New config `hlsAesUrl`/`playbackMode`.
- [x] **Ladder trim** to 1080/720/480 (land) / 1080/720/540 (vert); drop 240+360. No-upscale unchanged.
- [x] **Processed download** (`download-mux.ts`): top rung + audio → faststart MP4 → PRIVATE upload bucket;
      `GET /videos/:id/download` presigned URL.
- [x] **Captions root cause** `/opt/whisper.cpp/main` is a deprecation SHIM (exit 0, no vtt) →
      repointed symlink to `whisper-cli` + forced `-l en` + loud error logging.
- [x] Build gates green; on-builder synthetic E2E proved every output (AES decrypts 2239/2239 TS-aligned).
- [x] DEV AMI `ami-0da9c0a1348bb72f4` / **LT v9** default (rollback v8). PROD AMI `ami-0ae32ede6b67c1df5`
      / **LT v7** default (rollback v6).
- [ ] **Operator (local API host + Apple device):** `PUBLIC_API_BASE` is an ngrok tunnel to a LOCAL
      machine, so the AES manifest routes + `/download` only work when the local API runs this build; run
      a Safari/iOS check (native playback + caption sync) + confirm Chrome cbcs path still plays.
- [ ] Re-transcode existing videos (reset row to `status='uploaded'`) to populate the new trees.
- [ ] **Flag for Raushan: ROTATE the pasted dev + prod AWS keys (exposed in transcript).**
