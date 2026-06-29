# Euron Systems — Video Transcoding Pipeline (CLAUDE.md)

Standalone self-hosted VOD service (separate DB, separate AWS infra). Folds into the SaaS later.
Stack mirrors the other backends: Express 5 + Kysely (NOT Prisma at runtime) + PostgreSQL, ULID/uuid ids.
Architecture + how-it-works docs live in `docs/` and `infra/` — read those first; this file is the
orientation + the non-obvious operational rules that have bitten us.

## What runs where
- `src/index.ts` — API server (manifests, key delivery, token mint, video CRUD). Runs LOCALLY in dev,
  tunneled via ngrok; prod points at a real domain. Uploads go through a proxy to the private RDS.
- `src/worker/` — EC2 Spot transcode worker (Postgres-as-queue, FFmpeg + Shaka Packager + whisper,
  output to Cloudflare R2). One AMI; launched by the orchestrator.
- `src/orchestrator/` — Lambda (EventBridge every 1 min): reaps stale jobs + scales workers via
  EC2 `CreateFleet`. Does NOT touch encoding.
- `frontend/` — operator dashboard (Vite SPA). `player/` — standalone embeddable player package.

## Two delivery trees (today)
The worker produces BOTH a **cbcs CMAF** tree (Shaka Packager: HLS `master.m3u8` + DASH `manifest.mpd`)
and an **AES-128 MPEG-TS** tree (`hls-aes/`, native-Safari path). There is an in-progress **HLS-only /
AES-128 migration** (commit `a692996`, drop Shaka/cbcs/DASH, hls.js everywhere + native on iPhone) that
is **committed on `main` but NOT live on the worker AMI** (its first prod deploy failed, see below;
prod is rolled back to the old dual-tree AMI). The **dashboard frontend player IS hls.js + native**
already (committed + working). See `docs/PLAYBACK-SECURITY.md`.

## ⛔ Hard rules
- **Never run DB migrations / DDL.** Migrations are raw SQL in `docs/migrations/` and are
  developer-run. Only `npx prisma generate` (Kysely type-gen) is allowed. Edit `prisma/schema.prisma`
  freely; the developer applies migrations.
- **Deprecate-don't-delete (user rule):** when removing code, add a `// NOT IN USE` comment + drop the
  import; do not delete files or code blocks. (This is how the HLS-only migration retired Shaka.)
- No em dashes anywhere (commas/colons/parentheses instead).

## 🔥 Operational gotchas (these caused real outages — full detail in `docs/TROUBLESHOOTING.md`)
1. **Rollback a worker AMI by moving `$Latest`, NOT `--default-version`.** The orchestrator launches
   `LAUNCH_TEMPLATE_VERSION="$Latest"` (config default + Lambda env). `modify-launch-template
   --default-version <old>` is a NO-OP — workers keep launching the broken newest version. Real
   rollback: `create-launch-template-version --source-version <good> --launch-template-data
   '{"ImageId":"<old-ami>"}'` so the old AMI becomes `$Latest`. (A `--default-version` "rollback" cost
   a ~35-min outage + misdiagnosis once.)
2. **After a prod worker re-bake, VALIDATE a real worker CLAIMS a job — don't trust "build present."**
   The dev-builder smoke test (`node dist/worker/index.js`) hits the SAME-VPC dev RDS; a prod worker
   must reach the prod RDS over cross-VPC peering, which the smoke test can't exercise. Confirm
   `videos.attempts > 0` / a `euron-vod-primary-*` row in prod `pg_stat_activity` / orchestrator
   `backlog`→0 before relying on a new AMI. Keep the previous good AMI for instant rollback. (A
   dev-derived prod AMI once launched but never claimed; mechanism unconfirmed — prod workers have an
   egress-only SG, no SSH key, no CloudWatch, empty console.)
3. **AES key delivery + ngrok-free.** The player fetches the AES key from a URL built from
   `PUBLIC_API_BASE`. ngrok-**free** returns an HTML interstitial (`ERR_NGROK_6024`) instead of the key
   for any request without the `ngrok-skip-browser-warning` header — and native players can't send that
   header — so playback fails with a *decode* error (wrong key). For LOCAL browser testing set
   `PUBLIC_API_BASE=http://localhost:<port>`; for remote use a real / no-interstitial domain. The
   AES-tree key URI is a placeholder (`EURON_AES_KEY_URI`) rewritten **per request** by
   `src/controllers/hls.controller.ts`, so a `PUBLIC_API_BASE` change + API restart fixes it with NO
   re-transcode (only the cbcs `--hls_key_uri` is baked at packaging time).
4. **AES-128 here is deterrence, not DRM.** A determined/entitled user can extract the key (DevTools /
   `yt-dlp`) and decrypt. Casual download exposure depends on the PLAYER PATH: native HLS exposes a
   downloadable `.m3u8`; hls.js/MSE plays from a non-downloadable blob. The player routes only
   iPhone/iPod to native and everything else (incl. macOS Safari + iPad) to hls.js to remove the casual
   desktop download menu. Real prevention = hardware DRM (cbcs is already DRM-ready).
5. **The dev AMI builder is SSH-only.** `i-027a1b4188d597f20`, key `euron-dev-vod-kp` (~/Downloads); its
   role has no SSM, so Session Manager / send-command don't work. SG `sg-0099bff1ff1b348e4` allows SSH.
   Re-bake fast path: start builder → SSH → `git fetch + reset --hard origin/main` → `pnpm install` →
   `npx prisma generate` → `pnpm build` → `sudo rsync -a --delete dist /opt/euron-vod/` → `rm` any
   `/opt/euron-vod/.env` → **`sync; sync; sleep 2; sync`** (see gotcha #6, NON-NEGOTIABLE) →
   verify `sudo find /opt/euron-vod/dist -name '*.js' -size 0` prints nothing → `create-image
   --no-reboot` → new LT version → stop builder.
6. **`sync` before `create-image --no-reboot`, or the AMI ships a 0-byte `dist`.** `--no-reboot`
   snapshots the EBS block device without flushing the page cache; ext4 delayed allocation means
   freshly `rsync`ed files can be captured as **empty (0-byte) files** (inode + timestamp present,
   data not yet on disk). Workers from such an AMI run an empty `dist/worker/index.js`, do nothing,
   self-terminate in ~20-40s, and NEVER CLAIM — indistinguishable from a DB-connectivity failure
   (no logs, since prod workers have no SSH/SSM/CloudWatch). This silently broke the HLS-only AND the
   download-feature prod deploys. ALWAYS `sync` after the rsync and confirm `find … -size 0` is empty
   before imaging. Diagnose a suspected bad AMI by launching it in a worker subnet (IGW + the
   `172.30.0.0/16 → pcx-…` RDS peering route) with a key + `sg-0125707b…` (SSH) + the worker SG +
   `euron-vod-worker-prod-role`, NO UserData (boots idle), then SSH in and check `dist` file sizes.

## Commands
Backend: `pnpm dev | build | lint | type-check`, `npx prisma generate`, `pnpm build:lambda`.
Frontend: `cd frontend && pnpm type-check | lint | build | dev`.
Deploy: follow `infra/DEPLOYMENT.md` + `infra/ami-build.md`; helpers `scripts/push-ssm.sh`,
`scripts/deploy-lambda.sh`, `scripts/dev-upload.sh`, `scripts/dev-play.sh`.

## As-built (current)
Region `ap-south-1`. Dev acct `471112700629`, prod acct `923326988569` (cross-account RDS
`euronpgprodv1` over peering). LTs `euron-vod-{dev,prod}-worker-template`; Lambdas
`euron-vod-orchestrator-{dev,prod}`; SSM `/euron-vod-{dev,prod}`; R2 `euron-vod{-dev}`.
PROD LT `$Latest` = old working AMI `ami-0ae32ede6b67c1df5`; DEV LT `$Latest` = `ami-0da9c0a1348bb72f4`.
</content>
