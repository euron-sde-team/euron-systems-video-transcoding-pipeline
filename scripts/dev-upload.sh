#!/usr/bin/env bash
#
# One-command upload for local testing: create-upload -> POST file to storage ->
# complete (enqueue). Prints the videoId. Requires: curl, jq.
#
#   ./scripts/dev-upload.sh path/to/sample.mp4 [tenantId]
#
# Env overrides: API (default http://localhost:4020/api/v1), SERVICE_API_KEY.
set -euo pipefail

FILE="${1:?usage: dev-upload.sh <video-file> [tenantId]}"
TENANT="${2:-11111111-1111-1111-1111-111111111111}"
API="${API:-http://localhost:4020/api/v1}"
KEY="${SERVICE_API_KEY:-local-dev-service-key}"

[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }
EXT="${FILE##*.}"
NAME="$(basename "$FILE")"

# 1) create the upload (presigned POST)
RESP=$(curl -fsS -X POST "$API/videos/uploads" \
  -H "Authorization: Bearer $KEY" -H "X-Tenant-Id: $TENANT" \
  -H 'Content-Type: application/json' -d "{\"filename\":\"$NAME\"}")

VIDEO_ID=$(echo "$RESP" | jq -r '.data.videoId')
URL=$(echo "$RESP" | jq -r '.data.upload.url')
echo "videoId=$VIDEO_ID"

# 2) POST the file with the presigned fields (Content-Type must satisfy the
#    starts-with video/ policy; field order: policy fields, Content-Type, file).
FIELDS=$(echo "$RESP" | jq -r '.data.upload.fields | to_entries[] | "-F\n\(.key)=\(.value)"')
# shellcheck disable=SC2046
curl -fsS -X POST "$URL" \
  $(echo "$FIELDS") \
  -F "Content-Type=video/$EXT" \
  -F "file=@$FILE" -o /dev/null
echo "uploaded to storage"

# 3) verify + enqueue
curl -fsS -X POST "$API/videos/$VIDEO_ID/complete" \
  -H "Authorization: Bearer $KEY" -H "X-Tenant-Id: $TENANT" | jq -c '.data'

echo
echo "poll status:"
echo "  curl -s $API/videos/$VIDEO_ID -H 'Authorization: Bearer $KEY' -H 'X-Tenant-Id: $TENANT' | jq .data"
echo "play (after status=ready):"
echo "  ./scripts/dev-play.sh $VIDEO_ID $TENANT"
