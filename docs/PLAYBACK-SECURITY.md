# Playback security: cbcs AES-128 encryption, token mint, and the player end to end

This document explains how a video goes from "encrypted once in the worker" to "decrypted in a
viewer's browser," and why it is secure. The whole design rests on one sentence:

> The encrypted video sits in public R2 with no signed URLs. The ciphertext is worthless without a
> 16-byte key. The key is the only gate, and a short-lived token is what unlocks the key.

Everything below is plumbing around that sentence. The flow has three zones, in the order they
happen: **package (encrypt) -> mint (authorize) -> play (decrypt)**.

```
┌── Zone 1: Worker (once per video) ──────────────────────────────────────────┐
│ randomBytes(16) -> content key (secret) + KID (public label)                 │
│ Shaka Packager: cbcs AES-128 -> CMAF segments (HLS + DASH manifests)         │
│ content key --wrap(KMS)--> video_keys table   (secret, gated)                │
│ encrypted segments + manifests --> R2          (PUBLIC, no signing)          │
└──────────────────────────────────────────────────────────────────────────────┘
┌── Zone 2: Platform + this service (per viewing session) ─────────────────────┐
│ platform verifies enrollment -> POST /videos/:id/playback-token              │
│ returns a 5-minute, video-bound HS256 JWT                                    │
└──────────────────────────────────────────────────────────────────────────────┘
┌── Zone 3: Browser (per viewing session) ────────────────────────────────────┐
│ player fetches key from key endpoint using the token                         │
│ player streams PUBLIC ciphertext from R2                                      │
│ browser CDM decrypts in memory -> first frame                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Vocabulary first (these terms are genuinely easy to confuse)

- **AES-128**: the cipher and key size. A 128-bit (16-byte) symmetric key. The same key encrypts and
  decrypts.
- **Content key (`k`)**: the AES-128 secret that actually encrypts the pixels. Never public.
- **KID (Key ID)**: a non-secret 16-byte label that names which key a stream needs. It is written
  into the manifest and init segments so the player can ask for the right key. Think of KID as the
  label on a locker and the content key as the thing that opens it.
- **CENC (Common Encryption, ISO 23001-7)**: a standard that lets one encrypted file be consumed by
  multiple key/DRM systems. It defines two schemes:
  - `cenc` = AES-128 in CTR mode.
  - `cbcs` = AES-128 in CBC mode with pattern encryption.
- **cbcs** (what this pipeline uses): AES-128-CBC with pattern encryption (encrypt one 16-byte
  block, skip nine, repeat). Chosen for two reasons:
  1. Apple FairPlay requires cbcs, and Widevine and PlayReady also support it. So a single cbcs copy
     plays on iOS/Safari, Android, and desktop. A `cenc` copy would not play natively on Apple.
  2. Pattern encryption is cheaper on CPU and friendlier to hardware decoders, while still making the
     stream unplayable without the key.
- **ClearKey**: the W3C EME key system `org.w3.clearkey`. Instead of a commercial DRM license server
  returning an encrypted, device-bound license, ClearKey returns the raw key as JSON. The browser's
  EME/CDM still performs the actual decryption, but the key arrives in the clear. This is encryption
  plus access control, not robust DRM. See the honest-tradeoff section at the end.

---

## Zone 1: Packaging time (encrypt once, store the key wrapped)

This happens once per video in the transcode worker, at the `packaging` stage
(`src/worker/pipeline.ts:86-92`).

### 1a. Generate the content key and KID

`src/services/content-key.service.ts:37-45`:

```typescript
generate(): GeneratedKey {
  const key = randomBytes(16);                 // the SECRET: 16 bytes = AES-128 key
  return {
    kidHex: randomBytes(16).toString("hex"),   // the KID: a public label, also 16 bytes
    keyHex: key.toString("hex"),
    keyBytes: key,
  };
}
```

The key and the KID are two distinct random 16-byte values. The split between "public label" and
"secret key" is the core idea of CENC: you can ship the encrypted file anywhere (CDN, public bucket)
and signal which key it needs, while the key itself travels on a separate, gated channel. That is
exactly why the R2 bucket can be public-read.

This pipeline uses one key per video (the `video_keys` table has `video_id UNIQUE`). Larger DRM
setups rotate keys per rendition or per time window; one key per video is the right simplicity for
course content.

### 1b. Encrypt with Shaka Packager in cbcs / AES-128

`src/encoding/shaka.ts:71-83`:

```typescript
args.push(
  "--segment_duration", "4",
  "--fragment_duration", "4",
  "--protection_scheme", "cbcs",          // the encryption scheme
  "--enable_raw_key_encryption",          // we supply the raw key (no DRM license server)
  "--keys", `label=ALL:key_id=${input.key.kidHex}:key=${input.key.keyHex}`,
  "--hls_master_playlist_output", "master.m3u8",
  "--mpd_output", "manifest.mpd",
);
if (input.hlsKeyUri) args.push("--hls_key_uri", input.hlsKeyUri);
```

`--enable_raw_key_encryption` is the line that defines this architecture: there is no commercial DRM
license server (Widevine/PlayReady/FairPlay). The packager is handed the raw key directly, and at
playback the browser is handed the raw key directly (ClearKey).

Output is CMAF (fragmented MP4). The same byte-for-byte encrypted segments are described by two
manifests: `master.m3u8` (HLS) and `manifest.mpd` (DASH). One encrypted copy, two delivery formats.
The same key covers all video rungs and audio (`label=ALL`). Captions are intentionally left
unencrypted (no `drm_label`).

### 1c. Store the key wrapped, upload the ciphertext public

The raw key is never stored in plaintext. `content-key.service.ts` (`generateAndStore`, lines
92-103) wraps it before the DB write:

- Production: AWS KMS `Encrypt` (the key is encrypted under a KMS master key). `wrap_scheme = 'kms'`.
- Dev: local AES-256-GCM using a key derived from `PLAYBACK_TOKEN_SECRET`. `wrap_scheme = 'local_aes'`.

Stored in `video_keys` (`docs/migrations/0001_init.sql:79-90`): `video_id`, `tenant_id`, `kid_hex`,
`wrapped_key` (base64), `wrap_scheme`. A DB dump alone cannot yield playable keys without also
compromising KMS.

The encrypted segments and manifests upload to R2 under `{tenant_id}/{video_id}/...` with public-read
and long cache (`src/worker/r2.ts`). Segments use `max-age=31536000, immutable`; manifests use
`max-age=300`. No signed URLs anywhere, because the ciphertext is safe to expose.

---

## Zone 2: Mint time (authorize a viewer, issue a short-lived token)

When a viewer wants to watch, the main platform (not this VOD service) performs the real entitlement
check: is this user enrolled in the course that owns this video? That logic lives in the platform by
design; this VOD service trusts the platform. Once entitlement passes, the platform mints a playback
token from this service.

### The mint endpoint

`src/routes/videos.route.ts:24-28`, `src/controllers/videos.controller.ts:53-70`:

```
POST /api/v1/videos/:id/playback-token
Headers:  Authorization: Bearer <SERVICE_API_KEY>   (service-to-service secret)
          X-Tenant-Id: <tenant>
Body:     { "userId": "...", "ttlSeconds": 300 }
```

Auth here is `requireServiceAuth` (`src/middlewares/auth.middleware.ts:28-37`), a shared service
secret, not an end-user credential. This is the trust handoff: only the backend, which already
verified enrollment, holds `SERVICE_API_KEY`. The browser never sees it. This service additionally
checks only that the video exists (`src/services/videos.service.ts:173-183`).

### What the token is

`src/services/playback-token.service.ts:26-38`:

```typescript
const token = jwt.sign({ tenantId, userId, videoId }, config.PLAYBACK_TOKEN_SECRET, {
  algorithm: "HS256",
  expiresIn: ttl,   // default 300s, clamped to [10, 3600]
});
```

A plain HS256 JWT (symmetric HMAC signature) carrying `{ tenantId, userId, videoId, iat, exp }`.
Three properties make it the security boundary:

1. Video-bound: `videoId` is baked in, so a token for video A cannot fetch the key for video B.
2. Short-lived: 5 minutes by default. Even if leaked, it is useless quickly.
3. Tenant and user bound: useful for audit and for the on-screen watermark the player burns in.

Design note: HS256 (one shared secret to both sign and verify) is fine because the same service mints
and verifies. If a separate, less-trusted service ever needs to verify without being able to mint,
switch to RS256 (private key signs, public key verifies). The token is the access decision frozen in
time: the expensive enrollment lookup happens once at mint, and the hot key endpoint only does a
cheap signature verify.

---

## Zone 3: Playback time (fetch ciphertext plus key, decrypt locally)

The browser now has the manifest URL (R2 CDN) and a playback token. The player
(`player/src/euron-player.ts`) runs this sequence:

```
Browser (Shaka Player)               R2 (public)          Key endpoint (gated)
      │                                  │                       │
 1.   │ fetch key BEFORE load ──────────────────────────────►   │  GET /videos/:id/key?token=JWT
      │                                  │                       │  • verify JWT signature + exp
      │                                  │                       │  • check claims.videoId == :id
      │                                  │                       │  • unwrap key from video_keys (KMS)
      │ ◄──── { clearKeys: { kidHex: keyHex } } ─────────────    │  Cache-Control: no-store
 2.   │ player.configure({ drm:{ clearKeys } })                  │
 3.   │ player.load(manifest) ─────────► master.m3u8 / .mpd      │
      │ ◄──── manifest (lists rungs, signals KID + cbcs)         │
 4.   │ GET init.mp4, 0.m4s, 1.m4s ────► encrypted segments      │
      │ ◄──── ciphertext                                         │
 5.   │ EME/CDM decrypts segments with the key in memory         │
      │ ──► first frame                                          │
```

### 1. Fetch the key first

`player/src/euron-player.ts:43-51`:

```typescript
private async fetchClearKeys() {
  const url = new URL(this.config.keyEndpoint, window.location.href);
  if (this.config.playbackToken) url.searchParams.set("token", this.config.playbackToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await res.json();
  return body.clearKeys ?? null;   // { "a1b2c3...": "f5e6d7..." }
}
```

The token rides as a query param (`?token=`), not only a header. That is intentional
(`src/middlewares/auth.middleware.ts:45-50`): Apple native HLS issues the key request from inside the
media stack via the `#EXT-X-KEY` URI, which cannot attach an `Authorization` header. A query param is
the lowest common denominator that works for both Shaka and native HLS.

Fetching the key before `player.load()` (rather than via a lazy DRM callback) means the key is in
`drm.clearKeys` before the first encrypted segment arrives, so there is no mid-playback license
round-trip stall.

### The key endpoint (the ClearKey "license server")

`src/controllers/key.controller.ts:19-47`:

```typescript
const claims = req.playback;                                   // set by requirePlaybackToken
if (claims.videoId !== videoId) throw new ForbiddenError(...); // token must match THIS video
const key = await contentKeyService.getForPlayback(claims.tenantId, videoId); // unwrap from DB
res.set("Cache-Control", "no-store");                          // never cache the key
res.json({
  kid: kidBytes.toString("base64url"),
  k: key.keyBytes.toString("base64url"),
  clearKeys: { [key.kidHex]: key.keyHex },   // convenience map Shaka consumes
});
```

Real DRM would return an encrypted, device-bound license that only a hardware CDM can open. ClearKey
returns the raw key as JSON. It still flows through the browser's EME and CDM for the actual
decryption, but the key is in the clear.

Two response shapes:

- Default JSON for Shaka/MSE: `{ kid, k, clearKeys }` (the player reads `clearKeys`).
- `?format=raw` returns the 16 raw key bytes as `application/octet-stream`, for Apple native HLS whose
  `#EXT-X-KEY` URI fetches the key directly.

### 2 to 5. Shaka decrypts

`player/src/euron-player.ts:78-90` and `:114`:

```typescript
const clearKeys = await this.fetchClearKeys();   // get key first
player.configure({ ...(clearKeys ? { drm: { clearKeys } } : {}) });
await player.load(this.config.manifestUrl);      // then load manifest from R2
```

Shaka loads the manifest from R2, reads the KID plus cbcs signaling, sees it already holds that KID in
`drm.clearKeys`, downloads the public encrypted segments straight from R2, and feeds them plus the key
into the browser CDM, which decrypts in the media pipeline. ABR (`defaultBandwidthEstimate: 800_000`)
starts on a low rung for fast startup and ramps up.

Note there is no `registerRequestFilter` adding the token to segment requests. That confirms the
model: segments are public ciphertext and need no auth; only the key endpoint is gated. If signed
segment URLs are ever added, that is where a request filter would go.

---

## The honest security boundary

The player code comments that this is "deterrence, not DRM," and that is accurate.

What it protects against:

- Casual copying: anyone who finds an R2 URL gets useless ciphertext.
- Link sharing: the key endpoint requires a valid, unexpired, video-bound token, and tokens are only
  minted after the platform's enrollment check.
- Hotlinking the key: 5-minute TTL plus `Cache-Control: no-store` means a captured key request stops
  working fast and is never cached by a CDN or browser.
- DB compromise: keys are KMS-wrapped at rest.

What it does NOT protect against (because ClearKey is not hardware DRM):

- A determined, entitled user can open DevTools, read the `clearKeys` response, extract the AES key,
  and decrypt the public segments offline.
- No output protection (no HDCP, no screen-record blocking).

This is the deliberate tradeoff: avoid Widevine/FairPlay license cost and complexity, and accept that
the scheme stops the large majority of casual piracy but not a skilled, entitled user.

### Upgrade path to real DRM (no re-encoding)

The `protection_mode` enum (`src/db/enums.ts`) already includes `drm_cbcs`, and the content is
packaged in cbcs, which is exactly the scheme Widevine, PlayReady, and FairPlay all consume. To add
real DRM later, keep the same encrypted segments and swap the ClearKey delivery for a real license
server. No re-encode is required.

---

## File map

| Purpose | File | Key symbols |
|---|---|---|
| Pipeline orchestration | `src/worker/pipeline.ts` | key generate + package at `packaging` stage |
| cbcs encryption / packaging | `src/encoding/shaka.ts` | `packageCmaf()` |
| Content key gen + wrap/unwrap | `src/services/content-key.service.ts` | `generate()`, `generateAndStore()`, `getForPlayback()`, `wrap()`, `unwrap()` |
| Key storage (table) | `docs/migrations/0001_init.sql` | `video_keys` |
| Key repository | `src/repositories/video-keys.repository.ts` | `upsert()`, `findByVideoId()` |
| Token mint + verify | `src/services/playback-token.service.ts` | `mint()`, `verify()` |
| Mint route + controller | `src/routes/videos.route.ts`, `src/controllers/videos.controller.ts` | `POST /:id/playback-token` |
| Auth middleware | `src/middlewares/auth.middleware.ts` | `requireServiceAuth`, `requirePlaybackToken` |
| Key delivery endpoint | `src/controllers/key.controller.ts` | `getVideoKey()` |
| Playback URLs in API response | `src/services/videos.service.ts` | `toVideoResponse()` |
| Player | `player/src/euron-player.ts` | `EuronVideoPlayer.load()`, `fetchClearKeys()` |
| Demo harness | `player/demo/index.html` | manifest / token / key-endpoint inputs |

---

## One-paragraph summary

A worker generates a random AES-128 key plus a public KID, encrypts the video once into cbcs CMAF
segments (Shaka Packager, raw-key mode), stores the key KMS-wrapped in `video_keys`, and uploads the
public ciphertext plus HLS and DASH manifests to R2. When a viewer is entitled, the platform calls
`POST /videos/:id/playback-token` with a service secret to mint a 5-minute, video-bound HS256 JWT.
The browser fetches the key from `GET /videos/:id/key?token=...` (which verifies the JWT, confirms it
matches the video, unwraps the key, and returns it as ClearKey JSON with `no-store`), configures
Shaka with that key, then streams the public encrypted segments from R2 and decrypts them locally via
EME. The token is the gate, the ciphertext is safe in the open, and cbcs keeps the door open to real
DRM later.
