#!/usr/bin/env bash
#
# Mint a playback token for a ready video and print a player URL with everything
# prefilled. Serve the player first:  npx serve player -l 3000
# Requires: curl, jq.
#
#   ./scripts/dev-play.sh <videoId> [tenantId]
#
# Env overrides: API, SERVICE_API_KEY, R2_PUBLIC_BASE, PLAYER_BASE, USER_ID.
set -euo pipefail

VIDEO_ID="${1:?usage: dev-play.sh <videoId> [tenantId]}"
TENANT="${2:-11111111-1111-1111-1111-111111111111}"
API="${API:-http://localhost:4020/api/v1}"
KEY="${SERVICE_API_KEY:-local-dev-service-key}"
R2_PUBLIC_BASE="${R2_PUBLIC_BASE:-http://localhost:9000/euron-vod-local}"
PLAYER_BASE="${PLAYER_BASE:-http://localhost:3000/demo}"
USER_ID="${USER_ID:-demo-user}"

# fetch the video to learn orientation + confirm it is ready
VID=$(curl -fsS "$API/videos/$VIDEO_ID" -H "Authorization: Bearer $KEY" -H "X-Tenant-Id: $TENANT")
STATUS=$(echo "$VID" | jq -r '.data.status')
ORIENT=$(echo "$VID" | jq -r '.data.orientation // "landscape"')
[ "$STATUS" = "ready" ] || echo "warning: status is '$STATUS', not 'ready' yet" >&2

# mint a short-TTL playback token
TOKEN=$(curl -fsS -X POST "$API/videos/$VIDEO_ID/playback-token" \
  -H "Authorization: Bearer $KEY" -H "X-Tenant-Id: $TENANT" \
  -H 'Content-Type: application/json' -d "{\"userId\":\"$USER_ID\"}" | jq -r '.data.token')

PREFIX="$R2_PUBLIC_BASE/$TENANT/$VIDEO_ID"
MANIFEST="$PREFIX/master.m3u8"
KEY_EP="$API/videos/$VIDEO_ID/key"
THUMBS="$PREFIX/thumbnails/thumbnails.vtt"

# URL-encode helper
enc(){ jq -rn --arg s "$1" '$s|@uri'; }

echo "Open this in your browser (after: npx serve player -l 3000):"
echo "$PLAYER_BASE/?manifest=$(enc "$MANIFEST")&keyEndpoint=$(enc "$KEY_EP")&token=$(enc "$TOKEN")&thumbs=$(enc "$THUMBS")&orientation=$ORIENT&autoplay=1"
