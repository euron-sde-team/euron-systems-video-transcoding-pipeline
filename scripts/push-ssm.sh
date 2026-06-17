#!/usr/bin/env bash
#
# Push the worker's runtime secrets from a local .env file into AWS SSM Parameter
# Store under /euron-vod-<env>/. Run from your Mac (needs AWS creds with
# ssm:PutParameter). The EC2 Spot workers read these at boot via ami-bootstrap-<env>.sh.
#
#   ./scripts/push-ssm.sh dev            # reads ./.env  -> /euron-vod-dev/*
#   ./scripts/push-ssm.sh prod .env.prod # reads ./.env.prod -> /euron-vod-prod/*
#
# NOTE: AWS_S3_ACCESS_KEY/SECRET are deliberately NOT pushed. On EC2 the worker
# uses its instance ROLE for S3 + KMS; static keys would defeat that.
set -euo pipefail

ENV_NAME="${1:?usage: push-ssm.sh <dev|prod> [env-file]}"
ENV_FILE="${2:-.env}"
REGION="${AWS_REGION:-ap-south-1}"
PREFIX="/euron-vod-${ENV_NAME}"

[ -f "$ENV_FILE" ] || { echo "no env file: $ENV_FILE" >&2; exit 1; }

# Keys the worker needs from SSM. DATABASE_URL is now preferred for the DB; the
# PG_* are pushed too as a fallback. KMS/S3 access come from the instance role.
KEYS="DATABASE_URL PG_DATABASE_HOST PG_DATABASE_USER PG_DATABASE_PASSWORD PG_DATABASE \
UPLOAD_BUCKET R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT \
R2_PUBLIC_BASE KEY_KMS_KEY_ID PLAYBACK_TOKEN_SECRET PUBLIC_API_BASE"

for k in $KEYS; do
  # cut -f2- keeps '=' inside values (e.g. DATABASE_URL query strings, base64).
  v=$(grep -E "^${k}=" "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [ -z "$v" ]; then
    echo "skip  $PREFIX/$k  (empty in $ENV_FILE)"
    continue
  fi
  aws ssm put-parameter --region "$REGION" --type SecureString --overwrite \
    --name "$PREFIX/$k" --value "$v" >/dev/null
  echo "put   $PREFIX/$k"
done

echo "done -> $PREFIX  (region $REGION)"
echo "verify: aws ssm get-parameters-by-path --path $PREFIX --recursive --region $REGION --query 'Parameters[].Name'"
