# Build Spec — Self-Hosted Video Transcoding & Delivery Pipeline

> **For Claude Code.** This is the authoritative spec for building a VOD transcoding and
> delivery pipeline. Read the whole document before writing code. The **Critical Constraints**
> section is non-negotiable — several items there are subtle and wrong-by-default if you follow
> common tutorials. Build in the **phases** defined at the end; do not attempt everything at once.
>
> **Operating it:** `infra/DEPLOYMENT.md` is the deploy runbook; `docs/TROUBLESHOOTING.md` records every
> real production-bring-up failure (Spot service-linked role, launch-template UserData, the shaka
> `TMPDIR`/EXDEV packaging fix, R2 CORS, the ngrok key-URI interstitial, scaling/reaper) with fixes.

---

## 1. What we are building

An asynchronous, cost-optimized video pipeline that:

1. Accepts large video uploads (direct-to-object-storage).
2. Transcodes them into an adaptive bitrate (ABR) ladder with **FFmpeg**.
3. Packages them into **CMAF (fragmented MP4)** with **a single segment set serving both HLS and DASH**.
4. Encrypts with **AES-128 in `cbcs` mode (clear-key, no DRM yet)**.
5. Generates **closed captions** (WebVTT) and **scrub-preview thumbnails** (sprite + VTT).
6. Delivers via **Cloudflare R2 + Cloudflare CDN**.
7. Plays back with a **YouTube-like player** (ABR, quality menu, speed control, captions, hover-scrub previews, dynamic watermark) for both **16:9 (landscape)** and **9:16 (vertical reels)** content.

Compute runs on **AWS EC2 Spot (Graviton)**, orchestrated by an **AWS Lambda cron**, with **PostgreSQL as the only queue** (no SQS).

The system must be **additive toward DRM, forensic watermarking, and secure offline** later — those are NOT built now, but the schema (enums) and packaging choices must make them a config change, not a rewrite.

---

## 2. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Backend API | TypeScript + Express.js |
| Database | PostgreSQL (existing AWS RDS) — also the job queue |
| DB access | Kysely + `pg` Pool (raw `sql` template for the queue queries) |
| Orchestration | AWS Lambda (EventBridge cron, every 1 min) — the "brain" |
| Workers | EC2 **Spot**, **c7g.xlarge** (ARM Graviton3, 4 vCPU / 8 GB), region **ap-south-1 (Mumbai)** |
| Worker provisioning | Pre-baked **AMI** + **user-data bootscript**, launched via **Launch Template** |
| Transcode | **FFmpeg** (libx264) — single-decode, multi-output |
| Packaging | **Shaka Packager** → CMAF, dual HLS+DASH manifest |
| Encryption | **AES-128 `cbcs` (sample-AES) clear-key** |
| Captions | **whisper.cpp** on the worker → WebVTT |
| Raw uploads | **AWS S3** (same region as workers) |
| Processed output | **Cloudflare R2** + Cloudflare CDN |
| Web player | **Shaka Player** (UI library) |

Future (enum-stubbed, not built): DRM (Widevine/FairPlay/PlayReady on the same `cbcs` segments), forensic A/B watermarking, RN offline persistent licenses.

---

## 3. End-to-end flow

```
                          ┌─────────────────────────────────────────────────┐
  CLIENT                  │                  EXPRESS API                     │
  (web/RN)                │                                                  │
    │  POST /videos/uploads ──────────────► validate + rate-limit + cap      │
    │                      │                 create row (status='uploading') │
    │  ◄── presigned POST (S3) + videoId ──  return                          │
    │                      └─────────────────────────────────────────────────┘
    │
    ├── PUT file ──────────────────────────────► [ S3: euron-uploads ]
    │
    │  POST /videos/:id/complete ─────────────► HeadObject verify
    │                                           status='uploading' → 'uploaded'   (ENQUEUE)
    │
    │                                  ┌──────────────────────────────────────┐
    │                                  │  LAMBDA (cron, 1 min) — SCALE UP ONLY │
    │                                  │  1. reap stale 'processing' rows      │
    │                                  │  2. backlog = count('uploaded')       │
    │                                  │  3. running = DescribeInstances(tag)  │
    │                                  │  4. desired = min(MAX, ⌈backlog/D⌉)    │
    │                                  │  5. RunInstances(desired - running)   │
    │                                  └──────────────┬───────────────────────┘
    │                                                 │ launch
    │                                  ┌──────────────▼───────────────────────┐
    │                                  │  EC2 SPOT WORKER (loops; self-terminates) │
    │                                  │  claim (FOR UPDATE SKIP LOCKED)       │
    │                                  │   → ffprobe (orientation)             │
    │                                  │   → ffmpeg ABR ladder + thumbnails    │
    │                                  │   → whisper captions (VTT)            │
    │                                  │   → shaka package (CMAF + cbcs)       │
    │                                  │   → upload to R2                      │
    │                                  │   → status='ready'                    │
    │                                  │  heartbeat every 30s; spot-notice → release │
    │                                  │  empty queue + idle grace → shutdown  │
    │                                  └──────────────┬───────────────────────┘
    │                                                 │ upload
    │                                       [ R2: euron-vod ] ── Cloudflare CDN
    │
    │  GET manifest + segments ◄────────────────────── CDN
    │  GET key  ────────────────► API key endpoint (authed, short-TTL signed)
    │  ▶ Shaka Player decrypts + plays
```

---

## 4. CRITICAL CONSTRAINTS (read carefully — wrong-by-default)

1. **Encryption is `cbcs`, NOT legacy HLS AES-128.**
   Do **not** use classic whole-segment HLS `METHOD=AES-128` — it is HLS-only and would force a
   second copy of segments for DASH, destroying the single-copy CMAF benefit. Use **AES-128 in
   `cbcs` (sample-AES) common-encryption mode** so the *same* encrypted fMP4 segments play under
   both HLS (signalled SAMPLE-AES) and DASH (signalled `cbcs`). `cbcs` is also the exact scheme
   Widevine/FairPlay/PlayReady use, so the future DRM upgrade is a packager-flag change on the
   same segments — no re-encode.

2. **Aligned keyframes are mandatory.** Every rendition must have IDR frames at identical
   timestamps or ABR switching tears and the packager cannot cut clean segments. Use
   `-force_key_frames "expr:gte(t,n_forced*4)"` (4-second GOP, frame-rate independent). Do NOT
   rely on fixed `-g`.

3. **One decode, many encodes.** To use all 4 vCPUs efficiently, run a single FFmpeg process that
   decodes once and produces every rung via the `split` filter. Do not spawn one FFmpeg process
   per rung. Set `-threads 0`.

4. **Lambda scales UP only; workers terminate THEMSELVES.** The Lambda never calls
   `TerminateInstances` in the normal path. A worker that finds no work waits an idle-grace window
   then runs `shutdown -h now` (instances launched with
   `InstanceInitiatedShutdownBehavior=terminate`). This removes the scale-down race entirely.

5. **Count running workers from EC2, not a DB table.** Scale-up math uses
   `DescribeInstances` filtered by `tag:role=transcoder` and `instance-state-name in (pending, running)`.
   `pending` (booting) MUST be counted or the Lambda relaunches a fleet every minute during boot.
   A self-reported `workers` table goes stale when a spot instance is reclaimed — never scale on it.

6. **Scale on `uploaded` only.** `processing` rows are already claimed; their workers loop onto the
   backlog when done. Counting them double-provisions.

7. **Verify the upload before enqueue.** `/complete` must `HeadObject` the S3 key and only then
   flip `uploading → uploaded`. Never trust the client's "done."

8. **AES-128 clear-key is DETERRENCE, not protection.** It stops yt-dlp / right-click / casual
   scraping. A logged-in user with devtools can still capture the key + segments, and browser
   screen-recording is not preventable. Do not describe this as DRM anywhere in code/comments/UI.
   The key endpoint MUST be authenticated and issue short-TTL responses or the encryption is theatre.

9. **Never burn a per-user watermark into the video.** That forces a unique encode per viewer and
   destroys the single-copy model. "Dynamic watermarking" = a **player-rendered overlay** of the
   viewer's identity. (A single global brand logo burned in for everyone is acceptable — still one copy.)

10. **ARM builds.** The AMI must contain ARM/aarch64 builds of FFmpeg (with libx264), Shaka
    Packager, and whisper.cpp. Bake heavy deps into the AMI; user-data only configures + starts.

11. **EC2 → R2 egress is the cost watch-item.** Downloading source from same-region S3 is free;
    uploading renditions to R2 leaves AWS and is billed. Keep the rendition ladder disciplined.
    Don't add rungs speculatively.

12. **DB connection hygiene.** Lambda: open one client per invocation, close in `finally` (no
    module-scope pool — it leaks across frozen/thawed Lambda containers). Prefer RDS Proxy. Workers:
    small pool (2–4) and set `idle_in_transaction_session_timeout`.

---

## 5. Repository / module layout

Fits an existing Turborepo monorepo. Suggested:

```
apps/
  api/                 # Express: upload endpoints, /complete, key-delivery endpoint
services/
  orchestrator/        # AWS Lambda handler (cron): reap + scale-up
  worker/              # EC2 worker: claim loop, ffmpeg, whisper, shaka, R2 upload
packages/
  db/                  # schema.sql, migrations, Kysely types, queue queries
  encoding/            # ladder templates, ffmpeg command builder, shaka command builder
  player/              # Shaka Player wrapper + controls + watermark overlay (web)
infra/
  ami-bootstrap.sh     # user-data bootscript
  launch-template.json # EC2 launch template
  iam/                 # worker + lambda policies
```

---

## 6. Database schema

```sql
CREATE TYPE video_status    AS ENUM ('uploading','uploaded','processing','ready','failed','cancelled');
CREATE TYPE video_stage     AS ENUM ('transcoding','transcribing','packaging','uploading_output'); -- only while status='processing'
CREATE TYPE protection_mode AS ENUM ('none','aes_128','drm_cbcs');     -- 'drm_cbcs' reserved for future
CREATE TYPE watermark_mode  AS ENUM ('none','dynamic_overlay','forensic_ab');
CREATE TYPE orientation     AS ENUM ('landscape','portrait','square');

CREATE TABLE videos (
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
CREATE INDEX idx_videos_uploaded   ON videos (created_at)   WHERE status = 'uploaded';
CREATE INDEX idx_videos_processing ON videos (heartbeat_at) WHERE status = 'processing';
CREATE INDEX idx_videos_tenant     ON videos (tenant_id, created_at DESC);
```

---

## 7. Queue queries (reference)

```sql
-- CLAIM: one worker grabs one video atomically
UPDATE videos SET status='processing', stage='transcoding',
  locked_by=$1, locked_at=now(), heartbeat_at=now(), attempts=attempts+1
WHERE id = (SELECT id FROM videos WHERE status='uploaded'
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING *;

-- HEARTBEAT: worker calls every ~30s while processing
UPDATE videos SET heartbeat_at=now(), stage=$3, progress=$4
WHERE id=$1 AND locked_by=$2 AND status='processing';

-- REAP (in Lambda): reclaim dead/stuck jobs; give up past max_attempts
UPDATE videos
SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'uploaded' END,
    stage=NULL, locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
    error = CASE WHEN attempts >= max_attempts THEN 'max attempts exceeded' ELSE error END,
    updated_at=now()
WHERE status='processing'
  AND (heartbeat_at < now() - interval '10 minutes' OR locked_at < now() - interval '6 hours');

-- RELEASE (worker, on spot interruption): hand back without penalising the video
UPDATE videos SET status='uploaded', stage=NULL,
  locked_by=NULL, locked_at=NULL, heartbeat_at=NULL, attempts=attempts-1, updated_at=now()
WHERE id=$1 AND locked_by=$2 AND status='processing';
```

---

## 8. Upload API (Express)

`POST /videos/uploads` — issue a **presigned POST** (not PUT) so S3 enforces size/type:

```ts
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const ALLOWED_EXT = new Set(["mp4","mov","mkv","webm","m4v"]);
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024**3);
const MAX_IN_FLIGHT = 50;

app.post("/videos/uploads", uploadRateLimit, async (req, res) => {
  const { tenantId } = req.auth;
  const ext = String(req.body.filename ?? "").split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXT.has(ext)) return res.status(422).json({ error: "unsupported file type" });

  const { rows } = await pool.query(
    `SELECT count(*)::int n FROM videos WHERE tenant_id=$1 AND status IN ('uploading','uploaded','processing')`,
    [tenantId]);
  if (rows[0].n >= MAX_IN_FLIGHT) return res.status(429).json({ error: "too many videos in flight" });

  const videoId = randomUUID();
  const key = `${tenantId}/${videoId}/original.${ext}`;
  await pool.query(
    `INSERT INTO videos (id,tenant_id,status,source_key,output_prefix)
     VALUES ($1,$2,'uploading',$3,$4)`, [videoId, tenantId, key, `${tenantId}/${videoId}`]);

  const upload = await createPresignedPost(s3, {
    Bucket: process.env.UPLOAD_BUCKET, Key: key,
    Conditions: [["content-length-range", 1, MAX_BYTES], ["starts-with", "$Content-Type", "video/"]],
    Expires: 3600,
  });
  res.json({ videoId, upload });
});
```

`POST /videos/:id/complete` — verify, then enqueue:

```ts
import { HeadObjectCommand } from "@aws-sdk/client-s3";

app.post("/videos/:id/complete", async (req, res) => {
  const { tenantId } = req.auth; const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT source_key,status FROM videos WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
  const v = rows[0];
  if (!v) return res.status(404).json({ error: "not found" });
  if (v.status !== "uploading") return res.status(409).json({ error: `cannot complete from ${v.status}` });

  let head;
  try { head = await s3.send(new HeadObjectCommand({ Bucket: process.env.UPLOAD_BUCKET, Key: v.source_key })); }
  catch { return res.status(422).json({ error: "upload not found in storage" }); }

  await pool.query(
    `UPDATE videos SET status='uploaded', source_bytes=$3, updated_at=now()
     WHERE id=$1 AND tenant_id=$2 AND status='uploading'`, [id, tenantId, head.ContentLength]);
  res.json({ videoId: id, status: "uploaded" });
});
```

---

## 9. Key-delivery endpoint (cbcs clear-key)

This endpoint is the actual security boundary. Requirements:

- **Authenticated** by the viewer's session token (same auth as the rest of the API).
- **Authorize** that this viewer may watch this video (enrollment check).
- Return the content key only for short-lived, signed requests; **TTL ≤ 60s**, ideally bind to user + video + IP/session.
- Content keys are generated per-video at packaging time and stored encrypted (e.g. wrapped with AWS KMS); the endpoint unwraps and returns the raw key over HTTPS.

```ts
// GET /videos/:id/key   (auth required)
app.get("/videos/:id/key", requireAuth, async (req, res) => {
  const { tenantId, userId } = req.auth; const { id } = req.params;
  if (!(await canWatch(userId, id))) return res.status(403).end();
  const { kid, wrappedKey } = await getVideoKey(tenantId, id);   // from DB / KMS
  const key = await kms.decrypt(wrappedKey);
  res.set("Cache-Control", "no-store");
  res.json({ kid, k: key.toString("base64url") });              // Shaka clearKeys format
});
```

Web (Shaka): fetch this at playback start and inject via `player.configure('drm.clearKeys', {[kid]: k})`.
Apple native HLS: the `#EXT-X-KEY` URI in the manifest points at this endpoint (returns the raw key bytes).

---

## 10. Orchestrator (Lambda)

```ts
const MAX_WORKERS = Number(process.env.MAX_WORKERS ?? 20);
const DIVISOR     = Number(process.env.DIVISOR ?? 2);   // latency dial: lower = drain faster

export async function handler() {
  const db = await getClient();                          // one connection; closed in finally
  try {
    await db.query(REAP_SQL);

    const { rows } = await db.query(`SELECT count(*)::int n FROM videos WHERE status='uploaded'`);
    const backlog = rows[0].n;

    const running  = await countRunningWorkers();         // DescribeInstances tag:role=transcoder, pending+running
    const desired  = Math.min(MAX_WORKERS, Math.ceil(backlog / DIVISOR));
    const toLaunch = Math.max(0, desired - running);
    if (toLaunch > 0) await launchWorkers(toLaunch);      // RunInstances via Launch Template, MaxCount=toLaunch
    // No termination here. Workers self-terminate.
  } finally { await db.end(); }
}
```

`launchWorkers` → `RunInstancesCommand` with `LaunchTemplate`, `InstanceMarketOptions.MarketType='spot'`,
`InstanceInitiatedShutdownBehavior='terminate'`, `TagSpecifications role=transcoder`.

---

## 11. Worker

### 11.1 Loop

```ts
const WORKER_ID = await getInstanceId();      // instance metadata
const IDLE_GRACE_MS = Number(process.env.IDLE_GRACE_MS ?? 120_000);  // ~ boot time, avoids thrash
const POLL_MS = 5_000;

async function run() {
  startInterruptionWatcher();                 // polls 169.254.169.254/.../spot/instance-action
  let idleSince: number | null = null;

  while (true) {
    const v = await claimNext(WORKER_ID);
    if (!v) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince > IDLE_GRACE_MS) { await selfTerminate(); return; }
      await sleep(POLL_MS); continue;
    }
    idleSince = null;
    try { await transcodePipeline(v, WORKER_ID); await markReady(v.id); }
    catch (e) { await failOrRequeue(v.id, e); }
  }
}
// selfTerminate(): execSync("sudo shutdown -h now")  (instance launched w/ shutdown-behavior=terminate)
// interruption watcher: on HTTP 200 -> releaseClaim(WORKER_ID) -> process.exit(0)
```

### 11.2 transcodePipeline stages (update `stage`/`progress` via heartbeat between each)

1. `ffprobe` the source → width/height → set `orientation`, pick ladder template.
2. **transcoding**: single FFmpeg process, decode once, emit all rungs + extract AAC audio + tile thumbnails.
3. **transcribing**: extract 16 kHz mono WAV → whisper.cpp → `en.vtt` (skip if disabled).
4. **packaging**: Shaka Packager → CMAF segments, `cbcs` encryption, HLS + DASH manifests, caption track, generate per-video content key (kid/key), store wrapped key.
5. **uploading_output**: push the whole output tree to R2 under `output_prefix`.
6. `markReady` → status `ready`, set `ready_at`, `captions_langs`.

### 11.3 FFmpeg ladder (16:9 reference — see §13 for both)

```bash
ffmpeg -i input.mp4 -filter_complex \
"[0:v]split=4[a][b][c][d];\
 [a]scale=-2:1080[v1080];[b]scale=-2:720[v720];[c]scale=-2:480[v480];[d]scale=-2:360[v360]" \
 -map "[v1080]" -c:v:0 libx264 -b:v:0 5000k -maxrate:0 5350k -bufsize:0 7500k \
 -map "[v720]"  -c:v:1 libx264 -b:v:1 3000k -maxrate:1 3210k -bufsize:1 4500k \
 -map "[v480]"  -c:v:2 libx264 -b:v:2 1400k -maxrate:2 1500k -bufsize:2 2100k \
 -map "[v360]"  -c:v:3 libx264 -b:v:3  800k -maxrate:3  856k -bufsize:3 1200k \
 -preset medium -profile:v high -pix_fmt yuv420p -threads 0 \
 -force_key_frames "expr:gte(t,n_forced*4)" \
 -map 0:a -c:a aac -b:a 128k -ac 2 \
 -f mp4 out_1080.mp4   # (emit one mp4 per rung; or use -var_stream_map per your build)
```
Add the 240p floor as a 5th rung for low-network regions. Thumbnails in a parallel cheap pass:
```bash
ffmpeg -i input.mp4 -vf "fps=1/5,scale=160:-1,tile=10x10" thumbnails/sprite_%03d.jpg
# then build thumbnails.vtt mapping each timestamp range to a sprite tile region (#xywh=x,y,w,h)
```

### 11.4 Shaka Packager (CMAF + cbcs + dual manifest + captions)

```bash
packager \
 in=out_1080.mp4,stream=video,init_segment=video/1080/init.mp4,segment_template=video/1080/$Number$.m4s \
 in=out_720.mp4,stream=video,init_segment=video/720/init.mp4,segment_template=video/720/$Number$.m4s \
 in=out_480.mp4,stream=video,init_segment=video/480/init.mp4,segment_template=video/480/$Number$.m4s \
 in=out_360.mp4,stream=video,init_segment=video/360/init.mp4,segment_template=video/360/$Number$.m4s \
 in=audio.mp4,stream=audio,init_segment=audio/init.mp4,segment_template=audio/$Number$.m4s \
 in=en.vtt,stream=text,segment_template=text/en/$Number$.vtt,language=en \
 --segment_duration 4 --fragment_duration 4 \
 --protection_scheme cbcs --enable_raw_key_encryption \
 --keys label=SD:key_id=<KID_HEX>:key=<KEY_HEX> \
 --hls_master_playlist_output master.m3u8 \
 --mpd_output manifest.mpd
```
> Future DRM: replace `--enable_raw_key_encryption`/`--keys` with
> `--enable_widevine_encryption` / `--enable_playready_encryption` (+ FairPlay) pointed at a key
> server. Segments are byte-identical. This is the whole point of choosing `cbcs` now.

---

## 12. Storage hierarchy

**S3 (raw uploads):**
```
s3://euron-uploads/{tenantId}/{videoId}/original.{ext}
```

**R2 (processed output — both manifests over ONE shared segment tree):**
```
r2://euron-vod/{tenantId}/{videoId}/
  master.m3u8            # HLS
  manifest.mpd           # DASH        (only these two duplicate; segments are shared)
  video/{1080,720,480,360,240}/ init.mp4  0.m4s 1.m4s ...
  audio/                 init.mp4  0.m4s ...
  text/en/               0.vtt ...        # + other langs
  thumbnails/            sprite_001.jpg ...  thumbnails.vtt
  poster.jpg
```
Keep `{tenantId}/{videoId}/` as the immutable prefix for CDN rules, signed URLs, and usage accounting.

---

## 13. Encoding ladders (pick by `orientation`)

**16:9 landscape** (`scale=-2:H`):

| Rung | Resolution | Video kbps | Maxrate | Bufsize |
|---|---|---|---|---|
| 1080p | 1920×1080 | 5000 | 5350 | 7500 |
| 720p | 1280×720 | 3000 | 3210 | 4500 |
| 480p | 854×480 | 1400 | 1500 | 2100 |
| 360p | 640×360 | 800 | 856 | 1200 |
| 240p (floor) | 426×240 | 350 | 400 | 600 |

**9:16 vertical / reels** (`scale=W:-2`):

| Rung | Resolution | Video kbps | Maxrate | Bufsize |
|---|---|---|---|---|
| 1080p | 1080×1920 | 5000 | 5350 | 7500 |
| 720p | 720×1280 | 3000 | 3210 | 4500 |
| 540p | 540×960 | 1600 | 1700 | 2400 |
| 360p | 360×640 | 800 | 856 | 1200 |
| 240p (floor) | 240×426 | 350 | 400 | 600 |

Audio: AAC-LC 128 kbps stereo, shared across rungs. Segment/fragment duration: 4s everywhere.

---

## 14. Player (Shaka Player) — YouTube-like controls

Build a web player component wrapping the Shaka Player **UI library**. Configure:

- **ABR**: enabled (auto). Tune for low bandwidth — modest buffering-goal, fast start, allow the 240p floor.
- **Quality menu** (`⚙`): Auto + each rung (1080/720/480/360/240). Manual selection disables ABR until set back to Auto.
- **Speed menu** (`⏩`): 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2 (sets `video.playbackRate`).
- **Captions** (`CC`): off + each language in `captions_langs`. Styleable.
- **Scrub-preview thumbnails**: feed `thumbnails.vtt` to Shaka UI's thumbnail config → hover strip over the seek bar.
- **Clear-key**: fetch the key from the authed key endpoint at start, inject via `drm.clearKeys`.
- **Dynamic watermark overlay**: an absolutely-positioned, semi-transparent `<div>` over the video
  rendering the viewer's identity (email / user id / timestamp) that **repositions every few seconds**.
  Pure client-side; no segment changes.
- Standard: volume, mute, fullscreen, keyboard shortcuts (space/←/→/↑/↓/f/m), buffering spinner.
- **Orientation aware**: landscape uses the full control bar; vertical uses the compact layout (§15).

---

## 15. Wireframes

### 15.1 Admin / videos dashboard
```
┌─────────────────────────────────────────────────────────────────────┐
│  Euron VOD · Videos                                   [ + Upload ]    │
├─────────────────────────────────────────────────────────────────────┤
│  Title            Orient.  Status        Progress   Actions           │
│  ───────────────────────────────────────────────────────────────────  │
│  Intro to ML      16:9     ✓ ready        100%      ▶  ⧉  ⋯            │
│  React Hooks      16:9     ⟳ processing    62%      —     ⋯            │
│      └─ stage: packaging                                              │
│  Reel: Tip #4     9:16     ⟳ processing    18% (transcoding)          │
│  Bad upload       16:9     ✗ failed         —       ↻ retry  ⋯        │
│  Lecture 12       16:9     ⤓ uploading      —                         │
└─────────────────────────────────────────────────────────────────────┘
  Poll GET /videos?status=... (or SSE) to live-update status/stage/progress.
```

### 15.2 Landscape player (16:9)
```
┌───────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                       [   VIDEO 16:9   ]                        │
│                                                user@email ◹     │ ← dynamic watermark (moves)
│                                                                 │
│            ┌──────────────────────────────┐                    │
│            │  ▣ thumb preview    00:42     │                    │ ← hover scrub (thumbnails.vtt)
│            └──────────────────────────────┘                    │
│ ──────────●──────────────────────────────────────────────────  │ ← seek bar (buffered shaded)
│  ▶ ⏸   ⏮ ⏭    00:42 / 12:30      🔊 ▭▭▭    ⚙ 1080p  CC  ⏩ 1x  ⛶ │ ← control bar
└───────────────────────────────────────────────────────────────┘
  ⚙ Quality:  ● Auto  1080p  720p  480p  360p  240p
  CC Captions: ● Off   English  (+langs from captions_langs)
  ⏩ Speed:    0.5  0.75  ●1  1.25  1.5  1.75  2
  ⛶ Fullscreen
```

### 15.3 Vertical / reels player (9:16) — compact controls
```
            ┌────────────────────────┐
            │                        │
            │                        │
            │      [ VIDEO 9:16 ]    │
            │                        │
            │              user@..   │ ← watermark
            │                        │
            │  ──●─────────────────  │ ← thin seek bar
            │  ▶   00:08 / 00:30     │
            │  CC   ⚙   ⏩   🔊   ⛶  │ ← compact control row
            └────────────────────────┘
  Same menus as landscape, presented as bottom sheets / popovers.
```

---

## 16. Infrastructure

### 16.1 AMI (bake; do not install on boot)
Pre-install ARM/aarch64 builds of: FFmpeg (+libx264), Shaka Packager, whisper.cpp (+ chosen model,
e.g. `small` or `medium`), Node.js runtime, and the `services/worker` build.

### 16.2 user-data bootscript (`infra/ami-bootstrap.sh`)
- Read region + secrets refs from instance metadata / tags.
- Pull DB creds + R2 creds from AWS Secrets Manager / SSM.
- Export `INSTANCE_ID` (from metadata), `WORKER_ID`.
- `systemd` unit (or direct exec) to start the worker; on worker exit, the box has already
  `shutdown`-ed itself (terminate behavior).

### 16.3 Launch Template (`infra/launch-template.json`)
- `ImageId` = the baked AMI; `InstanceType` = `c7g.xlarge`.
- IAM instance profile = worker role.
- Spot, `InstanceInitiatedShutdownBehavior=terminate`.
- Tag `role=transcoder`.
- (Reliability option) An EC2 Fleet with `capacity-optimized` across `c7g.xlarge`, `c7g.2xlarge`,
  `c8g.xlarge`, `c6g.xlarge` to reduce interruptions — add only if interruptions/capacity errors appear.

### 16.4 IAM
- **Worker**: read `s3://euron-uploads/*`; write R2 (S3-compatible creds from Secrets Manager);
  DB access; KMS decrypt for key-wrapping. No EC2 perms needed (self-shutdown via OS).
- **Lambda**: `ec2:RunInstances`, `ec2:DescribeInstances`, `iam:PassRole` (worker profile), DB access.

---

## 17. Environment variables

```
AWS_REGION=ap-south-1
UPLOAD_BUCKET=euron-uploads
DATABASE_URL=postgres://...                 # RDS (prefer RDS Proxy endpoint)

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=euron-vod
R2_PUBLIC_BASE=https://cdn.euron.one        # Cloudflare CDN base for playback URLs

MAX_UPLOAD_BYTES=21474836480                # 20 GB
MAX_WORKERS=20
DIVISOR=2                                    # ceil(backlog/DIVISOR)
IDLE_GRACE_MS=120000
LAUNCH_TEMPLATE_NAME=transcoder
WHISPER_MODEL=/opt/models/ggml-small.bin
KEY_KMS_KEY_ID=...                           # for wrapping content keys
```

---

## 18. Build phases (do them in order; each must be runnable/testable before the next)

1. **DB**: enums + `videos` table + migrations + Kysely types + the queue queries (§6, §7).
2. **Upload API**: `/videos/uploads` (presigned POST) + `/videos/:id/complete` (HeadObject verify) (§8).
3. **Worker skeleton**: claim/heartbeat/release/self-terminate loop + interruption watcher, **no
   transcoding yet** (stub the pipeline). Verify claim/requeue/self-terminate behavior against the DB (§11.1).
4. **FFmpeg ladder**: ffprobe orientation detection + both ladder templates + thumbnails, single-decode multi-output (§11.3, §13).
5. **Captions**: whisper.cpp stage → `en.vtt` (§11.2 step 3).
6. **Packaging**: Shaka Packager CMAF + `cbcs` clear-key + dual manifest + caption track; per-video key generation + KMS wrapping (§11.4).
7. **R2 upload**: push the output tree under `output_prefix`; mark `ready` (§12).
8. **Orchestrator Lambda**: reap + scale-up; DescribeInstances counting; RunInstances via Launch Template (§10).
9. **Key endpoint**: authed, authorized, short-TTL clear-key delivery (§9).
10. **Player**: Shaka UI wrapper with ABR, quality, speed, captions, scrub thumbnails, clear-key, watermark overlay; landscape + vertical layouts (§14, §15).
11. **Infra**: AMI bootstrap + launch template + IAM (§16).

---

## 19. Acceptance criteria

- A 16:9 MP4 uploaded → reaches `ready` with `master.m3u8` + `manifest.mpd` over a **single shared
  segment set** in R2; plays in Shaka with working quality menu, speed menu, captions, and hover-scrub.
- A 9:16 MP4 → vertical ladder, plays in the vertical layout.
- Segments are `cbcs`-encrypted; playback succeeds only after a key is fetched from the **authenticated**
  endpoint; an **unauthenticated** key request returns 403.
- Killing a worker mid-job → the video returns to `uploaded` (reaper) and is reprocessed by another worker;
  the spot-interruption path returns it within seconds without consuming an attempt.
- Queue empties → fleet drains to **zero** within ~`IDLE_GRACE_MS` + one Lambda cycle.
- Captions present and toggleable; `captions_langs` populated.
- No code path burns a per-user watermark into the media.

---

## 20. Future-proofing (NOT built now — must remain a config change)

- **DRM**: flip `protection` to `drm_cbcs`, stand up Widevine/FairPlay/PlayReady license servers, swap
  the packager flags. Same `cbcs` segments. No re-encode, no schema migration.
- **Forensic A/B watermarking**: `watermark='forensic_ab'` — adds variant segments + per-session pattern;
  defer until needed.
- **Secure offline (RN)**: with DRM, use Widevine/FairPlay **offline persistent licenses**. Until then,
  `allow_offline` gates an encrypted-at-rest download (segments + key in Keychain/Keystore, in-app decrypt)
  — deterrence only, document it as such.