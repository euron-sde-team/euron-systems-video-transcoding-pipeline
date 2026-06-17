# Run and test the pipeline locally (no cloud)

Everything runs on your Mac: Postgres + MinIO in Docker (MinIO stands in for both the S3 raw-upload
bucket and the R2 output bucket), the API and worker as Node processes, and the player served
statically. ffmpeg + Shaka Packager run natively. No AWS account, no Cloudflare, no cost.

## 0. Prerequisites

- Docker Desktop (running).
- Node 20+ and `pnpm` (`corepack enable` if needed).
- `jq` for the helper scripts: `brew install jq`.
- **ffmpeg** (with libx264): `brew install ffmpeg` then `ffmpeg -hide_banner -encoders | grep libx264`.
- **Shaka Packager** binary on PATH:
  ```
  # Apple Silicon:
  sudo curl -L -o /usr/local/bin/packager \
    https://github.com/shaka-project/shaka-packager/releases/latest/download/packager-osx-arm64
  # Intel Mac: use packager-osx-x64 instead
  sudo chmod +x /usr/local/bin/packager && packager --version
  ```
- whisper is OPTIONAL. Without it, captions are skipped and the video still reaches `ready`
  (caption failure is non-fatal). To enable: `brew install whisper-cpp` (gives `whisper-cli`) and set
  `WHISPER_MODEL` in `.env` to a downloaded ggml model.

## 1. Start Postgres + MinIO

```
docker compose up -d
docker compose ps          # postgres healthy, minio up, createbuckets exited 0
```
MinIO console: http://localhost:9001 (minioadmin / minioadmin). Buckets `euron-uploads-local` and
`euron-vod-local` are created automatically; the output bucket is public-read for playback.

## 2. Apply the database schema (once)

```
psql "postgresql://postgres:postgres@localhost:5432/euron_video_pipeline" -f docs/migrations/0001_init.sql
```
(If you do not have `psql`: `docker compose exec -T postgres psql -U postgres -d euron_video_pipeline < docs/migrations/0001_init.sql`.)

## 3. Configure env

```
cp .env.local.example .env
```
The defaults already point at the Docker Postgres and MinIO. No edits needed for a first run.

## 4. Install deps + generate Kysely types

```
pnpm install
npx prisma generate
```

## 5. Run the API and the worker (two terminals)

```
# terminal 1
pnpm dev            # API on http://localhost:4020  (logs "API listening on :4020")

# terminal 2
pnpm dev:worker     # claim loop; logs "running OUTSIDE EC2 ... self-terminate is dry-run"
```
The worker polls the queue every few seconds. With the local `IDLE_GRACE_MS` it will not exit while
idle, so leave it running.

## 6. Serve the player (third terminal)

```
pnpm build:player
npx serve player -l 3000      # serves http://localhost:3000/demo/
```

## 7. Upload a test video

No clip handy? Generate a 15-second one with audio:
```
ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 \
  -t 15 -c:v libx264 -pix_fmt yuv420p -c:a aac sample.mp4
```
Then push it through the API in one command:
```
./scripts/dev-upload.sh sample.mp4
# -> videoId=<uuid>, "uploaded to storage", enqueued
```

## 8. Watch it process

```
API=http://localhost:4020/api/v1; KEY=local-dev-service-key
T=11111111-1111-1111-1111-111111111111
watch -n2 "curl -s $API/videos/<videoId> -H 'Authorization: Bearer $KEY' -H 'X-Tenant-Id: $T' | jq .data.status,.data.stage,.data.progress"
```
Expect `uploaded -> processing` (stage `transcoding -> packaging -> uploading_output`) `-> ready`.
The worker terminal logs each stage. Output lands in MinIO under
`euron-vod-local/<tenant>/<videoId>/` (browse it in the MinIO console).

## 9. Play it

```
./scripts/dev-play.sh <videoId>
# prints a prefilled URL like:
# http://localhost:3000/demo/?manifest=...&keyEndpoint=...&token=...&orientation=landscape&autoplay=1
```
Open that URL. The player fetches the cbcs clear-key from the API (localhost:4020), the manifest +
segments from MinIO (localhost:9000), decrypts, and plays with the quality / speed / captions menus,
hover-scrub thumbnails, and the moving watermark.

## What this proves

The full path end to end: presigned upload + HeadObject verify, Postgres claim
(`FOR UPDATE SKIP LOCKED`), ffprobe orientation, single-decode multi-encode ladder, sprite
thumbnails, cbcs packaging with a locally-wrapped key, dual HLS+DASH manifest over one segment set,
output upload, and authenticated clear-key playback. The only things NOT exercised locally are the
Lambda autoscaler and EC2 Spot lifecycle (those run the SAME worker code; see `infra/DEPLOYMENT.md`).

## Troubleshooting

- **Worker logs "spawn ffmpeg ENOENT" / "spawn packager ENOENT":** the binary is not on PATH. Check
  `which ffmpeg packager`, or set `FFMPEG_BIN` / `SHAKA_PACKAGER_BIN` to absolute paths in `.env`.
- **Upload 403 / SignatureDoesNotMatch:** MinIO not up, or `S3_ENDPOINT`/creds wrong. Confirm
  `docker compose ps` and that `.env` has `S3_ENDPOINT=http://localhost:9000`.
- **Player: manifest 404:** the job is not `ready` yet, or check the object exists in the MinIO
  console under `euron-vod-local/<tenant>/<videoId>/master.m3u8`.
- **Player: CORS error:** the compose file sets `MINIO_API_CORS_ALLOW_ORIGIN=*`; serve the demo via
  `npx serve` (not `file://`) so the origin is a real http origin.
- **Player: key fetch 401/403:** the token expired (default 1h) or is for a different video; re-run
  `dev-play.sh` to mint a fresh one.
- **Captions absent:** expected unless whisper is installed; it is non-fatal by design.

## Reset / teardown

```
docker compose down          # stop (keeps data)
docker compose down -v        # stop and wipe Postgres + MinIO data
```
