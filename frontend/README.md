# Euron Systems VOD: Operator Console

A Vite + React + TypeScript single-page app for the video transcoding pipeline:
upload, manage (list / retry / cancel / rename), and play back videos with a
custom, YouTube-grade player built on shaka-player core.

## Stack

- Vite 5, React 18, TypeScript (strict)
- TanStack Query v5 (server state, polling, optimistic mutations)
- React Router 6
- Tailwind CSS 3 (dark theme)
- shaka-player 4.11 core build (custom control bar, no Shaka UI)

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Then open **Settings** and fill in:

- **API base URL**, e.g. `http://localhost:4020/api/v1`
- **Service key** (the pipeline `SERVICE_API_KEY`)
- **Tenant ID** (a tenant UUID)
- **Preview user ID** (baked into minted playback tokens; defaults to `admin-preview`)
- **Streaming format** (HLS `.m3u8` or DASH `.mpd`; global preference for which manifest the player loads, both cover the same segments)

These stay in your browser (localStorage). "Test connection" calls `/health`.
The connection dot in the top bar reflects reachability.

> This is an internal/operator tool: it holds the service key in the browser and
> talks to the API cross-origin (the pipeline's CORS already allows this). Do not
> expose it publicly without putting the service key behind a backend proxy.

## Scripts

```bash
pnpm dev          # dev server
pnpm build        # tsc --noEmit + vite build (production bundle in dist/)
pnpm preview      # serve the production build
pnpm lint         # eslint
pnpm type-check   # tsc --noEmit
```

## What works without a transcode worker

Uploading and the full management UI work locally as long as the API + storage
(S3/MinIO) are up. A full transcode needs ffmpeg + Shaka Packager + whisper.cpp,
which usually are not present on macOS, so videos may sit in `processing`.

To exercise the **player UI** without a finished transcode, open a video detail
URL with a manual manifest, for example:

```
/videos/anything?manifest=https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd
```

This plays any public manifest with the full custom control bar (quality, speed,
captions, sprite scrub previews) and no decryption key. Real encrypted assets use
`playback.hls` + a minted playback token + the cbcs clear-key endpoint.

## Player feature map

- ABR with a manual quality menu (Auto re-enables adaptation; selecting a rung
  disables ABR first, then pins the track, the correct Shaka sequence)
- Sprite scrub previews on seek-bar hover via `player.getThumbnails()`
- Captions/subtitles menu + quick CC toggle
- Playback speed, volume, mute, PiP, fullscreen
- Keyboard shortcuts (space/k, ←/→ ±5s, j/l ±10s, f, m, c, ↑/↓, 0-9, ,/.)
- Auto-hiding controls, buffering spinner, error+retry overlay, replay
- Dynamic repositioning identity watermark (deterrence overlay, not burned in)
- Landscape / portrait / square orientation containers
```
