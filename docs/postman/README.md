# Postman collection

Import `euron-vod.postman_collection.json` (Postman -> Import). It drives the API service, which is
the only HTTP surface in the system. The orchestrator Lambda (cron-triggered) and the Spot workers
(DB pollers) are NOT HTTP and are not in this collection; you do not hit them from Postman.

## What runs where (dev with Lambda + Spot)
- **API service**: the thing Postman talks to. Run it on a dev box (or locally) pointed at the dev
  DB + dev S3. Set `baseUrl` to its URL.
- **Lambda**: scales workers up on a 1-minute EventBridge cron. To force a tick without waiting:
  `aws lambda invoke --function-name euron-vod-orchestrator-dev /dev/stdout`.
- **Spot workers**: claim from the DB queue, transcode, upload to R2, mark `ready`. No endpoint.

## Variables (set on the collection)
| Variable | Set to |
|----------|--------|
| `baseUrl` | API base. Default `http://localhost:4020/api/v1` (drive the API directly on your machine). Point it at an ngrok tunnel only if testing externally; ngrok is otherwise just for the worker's `PUBLIC_API_BASE` and playback. |
| `serviceKey` | the `SERVICE_API_KEY` the API was started with. NOT `PLAYBACK_TOKEN_SECRET` (the two look almost identical, differing by one character; swapping them gives a 401). |
| `tenantId` | a valid UUID (the `videos.tenant_id` column is `uuid`; a non-UUID returns 500 `invalid input syntax for type uuid`). |
| `userId` | any viewer id (for the playback token) |

`videoId`, `uploadUrl`, `playbackToken`, and the `up_*` presigned fields are filled automatically by
the test scripts on requests 1 and 8.

## Run order
1. **Create upload** (1) -> auto-saves `videoId`, `uploadUrl`, and the presigned `up_*` fields.
2. **Upload file to storage** (2) -> in the `file` form-data row, select your local video. This POSTs
   straight to S3 (not the API, not ngrok). The API uses a static IAM user (the dev norm), so there is
   no `X-Amz-Security-Token`; the collection disables that row by default. The `file` field MUST be last.
3. **Complete upload** (3) -> verifies the object and enqueues (`status=uploaded`).
4. **Get video** (4) -> poll until `status=ready` (the Spot worker processes it in the background).
5. **Mint playback token** (8) -> auto-saves `playbackToken`.
6. **Get content key** (9) -> returns the Shaka `clearKeys` map. Manifest + segments are served by the
   CDN/R2 at `R2_PUBLIC_BASE/<tenant>/<videoId>/master.m3u8`, not by this API.

## Notes
- For a real-S3 dev bucket, CORS must allow the upload POST (the deploy guide sets this). For MinIO
  local, CORS is `*` by default in the compose file.
- The key endpoint authenticates with the playback token (query param), not the service key.

## Troubleshooting
- **401 `Invalid service credentials`**: the `Authorization` header is wrong. It must be `Bearer <serviceKey>` using `SERVICE_API_KEY` (which starts differently from `PLAYBACK_TOKEN_SECRET`; the two differ by one character). A value without the `Bearer ` prefix counts as no credential.
- **500 `invalid input syntax for type uuid`**: `tenantId` is not a UUID. Use a real tenant UUID.
- **If you repoint `baseUrl` at an ngrok tunnel**: requests already send `ngrok-skip-browser-warning: true` (a no-op on localhost) to skip the free-tier interstitial; if the tunnel URL rotates, update both `baseUrl` here and the worker's SSM `PUBLIC_API_BASE`.
