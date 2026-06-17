# Troubleshooting & operational gotchas

Every entry here is a real failure that was hit bringing the pipeline up on AWS, with the verified
root cause and fix. Organized by phase: deploy prerequisites, worker boot, transcode/package,
playback, and scaling/lifecycle. Generic by design (substitute your env's names/IDs).

Quick mental model: `launch template -> AMI -> /opt/euron-vod/dist (worker code)`. The AMI bakes the
binaries + worker code; the per-env bootstrap (`infra/ami-bootstrap-<env>.sh`) is the **UserData**,
not baked, and pulls secrets from SSM at boot. So **a worker code change needs an AMI re-bake; a
bootstrap/config change is just a new launch-template version (no re-bake).**

---

## Deploy prerequisites

### First Spot launch fails: `AuthFailure.ServiceLinkedRoleCreationNotPermitted`
**Where:** orchestrator Lambda logs (`launchWorkers` -> `RunInstances`).
**Cause:** launching EC2 Spot requires the account-level service-linked role
`AWSServiceRoleForEC2Spot`. EC2 tries to auto-create it on the first Spot launch, but that needs
`iam:CreateServiceLinkedRole`, which the orchestrator Lambda role does not have.
**Fix (once per account):**
```
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com
# verify:
aws iam get-role --role-name AWSServiceRoleForEC2Spot --query 'Role.Arn'
```
It is **not** attached anywhere (it is owned by the `spot.amazonaws.com` service); it just has to
exist. Console alternative: IAM -> Roles -> Create role -> AWS service -> EC2 -> "EC2 - Spot
Instances". Once created, both dev and prod fleets work; you never see this again.

---

## Worker boot

### Worker launches but never claims a job; video sits in `uploaded`; instance idles with no logs
**Cause (most common):** the launch template has **no UserData**, so nothing runs the bootstrap on
boot. No `.env` is written, no `node dist/worker/index.js` starts, the box just idles. Tell-tale:
`/var/log/cloud-init-output.log` shows cloud-init "finished" in ~20s with no `[bootstrap]`/`[worker]`
lines, and the instance never self-terminates (the shutdown trap lives inside the bootstrap).
**Fix:** the UserData must be the base64 of `infra/ami-bootstrap-<env>.sh`. See DEPLOYMENT.md step 9.
Verify on a running worker: `grep '^PG_\|TMPDIR' /opt/euron-vod/.env` should be populated.

### Worker can't reach the DB (silently connects to localhost)
**Cause:** runtime DB config order is **`DATABASE_URL` preferred, `PG_*` fallback**
(`src/db/connection.ts`, `src/orchestrator/index.ts`). If `DATABASE_URL` is empty AND the `PG_*`
vars are empty, `host` falls back to `localhost` and the worker can never reach RDS. (Historically,
before the `DATABASE_URL`-preferred change, only `PG_*` were read, so putting only `DATABASE_URL` in
SSM left the worker on `localhost`.)
**Fix:** put **`DATABASE_URL` in SSM** (sufficient on its own now) and/or the full `PG_*` set.
`scripts/push-ssm.sh` pushes both. Cross-check: `aws ssm get-parameters-by-path --path
/euron-vod-<env> --query 'Parameters[].Name'`. Note `DATABASE_URL` is also what `prisma generate`
reads.

### SecureString params don't decrypt on the worker
**Cause:** the worker role lacks `kms:Decrypt` on the key the SSM params are encrypted with. Default
SSM params use the AWS-managed `aws/ssm` key (covered by the role's `ssm:GetParameter` via the key's
service policy); a CMK needs explicit `kms:Decrypt` (the `<SSM_KMS_KEY_ARN>` statement in
`infra/iam/worker-policy.json`).
**Fix:** ensure `worker-policy.json`'s `DecryptSecureStrings` resource matches the key used to create
the params.

---

## Transcode / package

### Packaging fails: `[shaka-packager] exited 2 ... Failed to replace 'manifest.mpd' with '/tmp/packager-tempfile-...', error: generic:18`
**This was the big one.** `generic:18` is errno `EXDEV` (cross-device link). Shaka writes its MPD
atomic-write temp file to the OS temp dir (`/tmp`, a **tmpfs** on Amazon Linux 2023) then `rename()`s
it onto the output under `WORK_DIR=/mnt/work` (EBS). A rename across two filesystems fails.
**Key fact:** shaka's MPD writer **ignores `--temp_dir`** but **honors `TMPDIR`**. Verified on-box:
`packager ... --mpd_output manifest.mpd` fails with default temp, succeeds with `TMPDIR=/mnt/work`.
**Fix (in the bootstrap, no re-bake):** `export TMPDIR=/mnt/work` before running the worker. This is
in `infra/ami-bootstrap-<env>.sh`. The `--temp_dir` arg in `src/encoding/shaka.ts` is harmless but
insufficient on its own.
**Deterministic:** this fails identically every attempt, so it exhausts `max_attempts` and lands in
`failed`; it does not "sometimes work". Reprocess a `failed` video with `POST /videos/:id/retry`.

### Rotated / portrait phone video comes out sideways or squished
**Cause:** ffmpeg does **not** autorotate inputs used in a complex filtergraph (`-filter_complex
[0:v]...`), only simple `-vf` / direct outputs. So a portrait phone clip (coded landscape + a 90deg
display matrix) would be processed with the wrong ladder + un-rotated frames.
**Fix (in code):** `src/encoding/probe.ts` reads the display rotation (Display Matrix side data, or
the legacy `rotate` tag) and returns display dimensions; `src/encoding/ffmpeg.ts` applies an explicit
`transpose` (with `-noautorotate`) before the split. Inert for non-rotated video (rotation=0 ->
byte-identical command). Requires an AMI re-bake (it's worker code). Validate with one real portrait
clip before relying on it.

### Captions missing on an otherwise-ready video
**Expected** when whisper.cpp is absent. Caption generation (WAV extraction + whisper) is fully
non-fatal: any failure is caught and the video still reaches `ready` without captions
(`src/encoding/captions.ts`, both steps inside the try).

---

## Playback

### Browser playback fails with Shaka `Error 1002` and a CORS error on `master.m3u8`
**Cause:** the R2 bucket has no CORS policy, so the browser blocks the cross-origin manifest/segment
fetches from the CDN. The key fetch (to the API) may be `200` while the manifest is blocked.
**Fix:** set CORS on the R2 bucket. `GET, HEAD` is all playback needs, but `AllowedHeaders: *`
matters because segments are fetched with a `Range` header (not CORS-safelisted -> triggers an
`OPTIONS` preflight). Cloudflare -> R2 -> bucket -> Settings -> CORS, or the S3 API:
```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET","HEAD"], "AllowedHeaders": ["*"],
   "ExposeHeaders": ["Content-Length","Content-Range","ETag","Accept-Ranges"], "MaxAgeSeconds": 3600 }]
```
Tighten `AllowedOrigins` to your real app domains in prod (wildcard is fine for dev).

### Key fetch returns HTML with `Ngrok-Error-Code: ERR_NGROK_6024` (HLS won't decrypt)
**Cause:** `PUBLIC_API_BASE` is an ngrok **free** tunnel. The HLS manifest has the native-HLS key URI
baked in at packaging time (`--hls_key_uri = ${PUBLIC_API_BASE}/.../key?format=raw`), and ngrok free
returns its browser-warning interstitial (HTML, 200) instead of forwarding, because a baked
`#EXT-X-KEY` URI can't carry the `ngrok-skip-browser-warning` header.
**This is not a backend bug** (the response is from ngrok, not the API). Fixes:
- Dev/web testing: play the **DASH** manifest (`manifest.mpd`) instead of HLS. DASH decrypts via the
  player's clear-key config (fetched from the API key endpoint), with no baked key URI.
- To test HLS over a tunnel: use a paid / no-interstitial ngrok domain.
- Prod: `PUBLIC_API_BASE` is your real API domain (no interstitial), so the HLS path (and native iOS
  HLS, which needs the baked URI) works.

### `/key` returns 401 "Invalid service credentials" or "Invalid or expired playback token"
- Management endpoints need `Authorization: Bearer <SERVICE_API_KEY>` (NOT `PLAYBACK_TOKEN_SECRET`,
  the two look alike). A value without the `Bearer ` prefix counts as no credential.
- The `/key` endpoint needs a **playback token** (minted by `POST /videos/:id/playback-token`), bound
  to that exact video; tokens expire (default 300s, max 3600s). Re-mint if stale.
- `X-Tenant-Id` must be a valid UUID (`videos.tenant_id` is `uuid`); a non-UUID returns 500
  `invalid input syntax for type uuid`.

---

## Scaling & lifecycle

### Uploaded a video but no new worker launched
**Usually expected.** The orchestrator sizes on `desired = min(MAX_WORKERS, ceil(backlog / DIVISOR))`,
`toLaunch = max(0, desired - running)`, where `backlog = count(status='uploaded')` (a `processing`
row is NOT counted) and `running` = count of Spot instances (not idle ones). With `DIVISOR=2`: a
single queued video behind one running worker gives `desired=1=running -> toLaunch=0`, so it queues
behind the in-flight job rather than getting its own worker. You need `backlog >= 3` (with `DIVISOR=2`
and 1 running) before a second worker spawns. This is head-of-line blocking; the in-flight worker
picks up the queued video when it finishes. (A future improvement: size on `uploaded + processing`,
or track idle vs busy workers.)

### Terminated a worker but the row stayed `processing` (didn't go back to `uploaded`)
**Cause:** an abrupt `terminate-instances` gives the worker a short SIGTERM grace, often too short for
its `releaseClaim` DB round-trip to finish (unlike a Spot interruption, which gives a ~2-min notice
and releases cleanly). The row is left `processing` on the dead instance.
**Fix:** the reaper requeues `processing` rows whose heartbeat is stale **>10 min**; it runs every
orchestrator tick. So it self-heals after ~10 min. To requeue immediately you can flip the row to
`uploaded` yourself (the reaper does the same). Because the row is `processing`, not `uploaded`, the
orchestrator also won't launch a replacement until it's requeued.

### Worker self-terminated mid-job ("user-initiated termination", no eviction)
A worker that catches a **Spot interruption notice** gracefully runs `shutdown -h now` *before* AWS
reclaims it, so the Spot request shows `instance-terminated-by-user` and there's **no
`BidEvictedEvent`** in CloudTrail; this is correct Spot handling, not an API terminate. The claim is
released (`releaseClaim`, attempt un-counted) and the orchestrator launches a replacement. There is no
checkpointing, so each interruption restarts the transcode from scratch; if interruptions are
frequent for one instance type/AZ, diversify Spot (capacity-optimized across `c7g.xlarge /
c7g.2xlarge / c8g.xlarge / c6g.xlarge` + multiple subnets/AZs) or use on-demand.

### Launch template: console shows the old AMI / old config after an update
**Cause:** `$Latest` != `$Default`. `create-launch-template-version` does NOT promote the new version
to default; the console renders the **Default** version. The orchestrator uses
`LAUNCH_TEMPLATE_VERSION=$Latest` (highest number), so it picks up new versions automatically, but the
console (and anything resolving `$Default`) lags.
**Fix:** after creating a new version, set it default for clarity:
`aws ec2 modify-launch-template --launch-template-id <id> --default-version <n>`.

---

## Re-baking the AMI for a worker code change (fast path)

A worker **code** change (anything under `src/`) needs a new AMI; a **bootstrap/UserData or SSM**
change does not. Fast re-bake reusing the current AMI as the base (no reinstalling
ffmpeg/packager/whisper):

1. Launch a plain on-demand arm64 instance **from the current worker AMI**, NOT via the launch
   template / no user-data (else the baked bootstrap runs and `shutdown -h now`s your builder).
2. On it: `cd /opt/src && git pull && pnpm install && npx prisma generate && pnpm build && sudo rsync
   -a --delete dist /opt/euron-vod/ && sudo rm -f /opt/euron-vod/.env`.
3. Verify the fix landed: `grep -c temp_dir /opt/euron-vod/dist/encoding/shaka.js` (etc.), and the
   binary supports flags you rely on: `packager --help | grep -i temp_dir`.
4. `aws ec2 create-image --instance-id <builder> --no-reboot --name euron-vod-worker-$(date +%Y%m%d)`.
5. Point the template at it (keeps UserData): `aws ec2 create-launch-template-version
   --launch-template-id <id> --source-version '$Latest' --launch-template-data '{"ImageId":"<new-ami>"}'`,
   then set it default (above). Terminate old workers so fresh ones boot the new AMI.

See `infra/ami-build.md` for a from-scratch build (only when the binaries themselves change).

---

## Local dev (no cloud)

`docs/LOCAL.md` runs Postgres + MinIO via `docker compose` (MinIO stands in for both S3 and R2; the
S3 client honors `S3_ENDPOINT` with path-style). On macOS the project dir and `/tmp` are the same
filesystem, so the `EXDEV`/`TMPDIR` packaging issue does NOT reproduce locally (it is EC2-only, where
`/tmp` is tmpfs and `/mnt/work` is EBS). Use `scripts/dev-upload.sh` / `scripts/dev-play.sh`.
