# Safari AES-128 HLS + ABR trim + processed download + captions fix (June 2026)

Reference for the four related changes shipped together to the standalone VOD pipeline. All four are
**worker code** (need an AMI re-bake) except the API manifest routes + player (which run on the API/player
host). Shipped to dev (`471112700629`) and prod (`923326988569`), `ap-south-1`. Commit `eee439c` on `main`.

---

## 1. Safari/Apple playback: AES-128 HLS over MPEG-TS (additive)

### Why
Playback encrypts with Shaka Packager `cbcs` (SAMPLE-AES, fMP4) and decrypts via **ClearKey EME**.
Safari/iOS have **no ClearKey CDM** (only FairPlay), so every Apple browser failed. Shaka Packager
**cannot emit HLS `METHOD=AES-128`** (only SAMPLE-AES/cbcs), and cbcs vs AES-128 produce different segment
bytes, so a separate tree is unavoidable to support Safari.

### What
Add a parallel **AES-128 (`METHOD=AES-128`) HLS-over-MPEG-TS** tree that Safari plays **natively** (no CDM,
key fetched over HTTPS). It is produced by **ffmpeg** (`-hls_key_info_file`), **remuxed** (`-c copy`) from
the per-rung MP4s the transcoder already wrote (CPU-cheap, no re-encode). Decision: **additive** (keep the
proven cbcs/DASH+ClearKey path untouched for Chrome/Firefox; add the AES tree only for Safari). Unify on
AES-TS for all browsers (retire cbcs/DASH) is a documented Phase 2.

- New worker module `src/encoding/hls-aes.ts` -> `packageHlsAes()`. Output subtree under the same prefix:
  `hls-aes/master.m3u8`, `hls-aes/<rung>/index.m3u8` + `seg_NNN.ts`, `hls-aes/subs/<lang>.{m3u8,vtt}`.
- Same 16-byte content key as the cbcs tree (`key.keyBytes`). The raw key + key-info file are written
  **only under the temp renditions dir, never `outputDir`**, so the R2 upload can never ship the key.
  `worker/r2.ts` also skips `*.key` defensively and learned `.ts` -> `video/mp2t`.
- The EXT-X-KEY URI baked at transcode time is a **sentinel** (`EURON_AES_KEY_URI`, in `utils/const.ts`)
  because the per-viewer token is unknown then; the API rewrites it per request.

### Per-request manifest token injection (API)
Native Safari fetches the EXT-X-KEY/variant/segment URIs itself and **cannot send an auth header**, and the
playback token is per-viewer + short-TTL, so it rides in the manifest URLs. The API fetches the stored
playlists from R2 and rewrites them per request (segments stay on the public CDN, the cost win):
- `src/services/r2-read.service.ts` `getObjectText()` (R2 GET).
- `src/controllers/hls.controller.ts`:
  - `GET /videos/:id/hls/master.m3u8` -> variant URIs become absolute tokenized API URLs; the subtitle
    `URI="subs/..."` becomes an absolute CDN URL.
  - `GET /videos/:id/hls/:rung/index.m3u8` -> the `EURON_AES_KEY_URI` sentinel becomes
    `<api>/api/v1/videos/<id>/key?format=raw&token=<token>`; `seg_NNN.ts` become absolute CDN URLs.
  - Both behind `requirePlaybackToken`, both assert `claims.videoId === :id`, `:rung` allowlisted
    (`^[0-9]{2,4}$`), responses `no-store`. The existing `?format=raw` key endpoint is reused unchanged.

### Player
`player/src/euron-player.ts` now splits `load()` into `loadMse()` (unchanged Shaka/cbcs path) and
`loadNative()`. Auto mode: if ClearKey EME is unavailable (`requestMediaKeySystemAccess('org.w3.clearkey')`
rejects) AND native HLS plays AND `hlsAesUrl` is set -> native `<video src=hlsAesUrl>` (no Shaka, no EME),
keeping the DOM watermark. No userAgent sniffing. New config: `hlsAesUrl`, `playbackMode`.
`videos.service` exposes `playback.hlsAes` (API-relative master URL).

### Captions on native Safari (D4, included this phase)
`packageHlsAes` also emits a subtitle rendition: `hls-aes/subs/<lang>.vtt` (whisper VTT with
`X-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000` prepended) + `hls-aes/subs/<lang>.m3u8`, an `#EXT-X-MEDIA:
TYPE=SUBTITLES` line on the master, and `SUBTITLES="subs"` on each variant. The AES TS segments start at
PTS 0 (`-muxpreload 0 -muxdelay 0`) so cues align. Verify cue sync on a real Safari/iOS device.

---

## 2. ABR ladder trim
`src/encoding/ladder.ts`: dropped 240p **and** 360p. Now LANDSCAPE `[1080,720,480]`, VERTICAL
`[1080,720,540]`. The no-upscale filter in `selectLadder()` is unchanged (rungs still capped at source).

## 3. Processed downloadable MP4
`src/encoding/download-mux.ts`: remux the top rung + audio into one faststart MP4 (`-c copy`, no
re-encode). Uploaded to the **private** S3 upload bucket at `processed/<tenant>/<id>.mp4` (NOT the public
CDN, it is the unencrypted master). `GET /videos/:id/download` (service-authed) returns a short-lived
presigned URL; `download` link surfaced on `GET /videos/:id` when ready. The step is non-fatal.

## 4. Captions fix (the real "never generated" bug)
**Root cause:** `WHISPER_BIN` defaulted to `/opt/whisper.cpp/main`, which on the current AMI is a
**deprecation shim** that prints "use whisper-cli" and **exits 0 producing no VTT**. The worker saw exit 0,
then `access(vtt)` failed, and the swallow-all `catch` logged only a `warn` -> captions silently never
appeared in any browser.
**Fix:**
- Infra: repointed `/opt/whisper.cpp/main` -> `/opt/whisper.cpp/build/bin/whisper-cli` on the builder so
  the AMI default actually transcribes (verified: produces `en.vtt`). This bakes into the AMI and copies
  to prod.
- Code (`src/encoding/captions.ts`): force the language with `-l <lang>` (default `en` via new
  `CAPTIONS_DEFAULT_LANG`; per-video `pipeline_config.captionsLang`), and log failures at **error** with
  stderr instead of a silent `warn` (kept non-fatal). Once the VTT exists, the cbcs tree's existing
  subtitle rendition gives Chrome captions automatically.

---

## Verification done (on the dev builder, real ffmpeg/packager/whisper)
A synthetic 12s clip ran the full encoding chain. Confirmed: ladder = 720,480 (no upscale to 1080, no
240/360); `en.vtt` generated (whisper-cli); AES master has the subtitle rendition + `SUBTITLES="subs"`;
variants are `METHOD=AES-128` with the sentinel URI; `X-TIMESTAMP-MAP` present; `processed.mp4` has audio;
**zero `*.key` files in the output tree**. AES correctness proven by decrypting `seg_001` with the
playlist-declared IV: **2239/2239 MPEG-TS packets aligned to 0x47** (decrypts cleanly).

## Deployment as-built
| | Dev (`471112700629`) | Prod (`923326988569`) |
|---|---|---|
| New worker AMI | `ami-0da9c0a1348bb72f4` | `ami-0ae32ede6b67c1df5` (copied from dev) |
| Launch template | `euron-vod-dev-worker-template` **v9** (default) | `euron-vod-prod-worker-template` **v7** (default) |
| Rollback LT version | v8 (`ami-0d03…`) | v6 (`ami-0a26…`) |
| Whisper fix | baked into the AMI (symlink) | inherited via the AMI copy |

Orchestrators launch `$Latest`, so the new code takes effect on the next backlog. Re-transcode existing
videos by resetting their row to `status='uploaded'` (clear `locked_by`/`stage`/`heartbeat_at`,
`attempts=0`, keep `output_prefix`).

## Operator follow-ups (NOT done here; need the local API host + an Apple device)
- The API (`PUBLIC_API_BASE` in SSM) is an **ngrok tunnel to a local machine**, not a hosted service. The
  new AES manifest routes + `/download` only work when **your local API runs this build** behind that URL.
  For real Safari playback either keep ngrok up on the new build or host the API publicly.
- End-to-end check on a real **Safari/iOS** device: native path plays, captions show and are time-synced
  (the `X-TIMESTAMP-MAP`/PTS-0 alignment), Chrome still plays the unchanged cbcs/DASH path.
- Rotate the dev + prod AWS keys pasted in chat.
