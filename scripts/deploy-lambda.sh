#!/usr/bin/env bash
#
# Rebuild + redeploy the orchestrator Lambda CODE (not config). First-time
# creation + configuration is a one-time manual step, see infra/DEPLOY-LAMBDA-DEV.md.
# This just ships new code to an existing function.
#
#   ./scripts/deploy-lambda.sh dev          # -> euron-vod-orchestrator-dev
#   ./scripts/deploy-lambda.sh prod         # -> euron-vod-orchestrator-prod
#
# Env overrides: AWS_REGION (default ap-south-1).
set -euo pipefail

ENV_NAME="${1:-dev}"
REGION="${AWS_REGION:-ap-south-1}"
FN="euron-vod-orchestrator-${ENV_NAME}"

echo "[1/3] bundling orchestrator (esbuild)..."
pnpm build:lambda

echo "[2/3] zipping..."
rm -f orchestrator.zip
( cd dist-lambda && zip -q -r ../orchestrator.zip index.js )

echo "[3/3] updating function code: $FN ($REGION)..."
aws lambda update-function-code --region "$REGION" --function-name "$FN" \
  --zip-file fileb://orchestrator.zip --query 'LastUpdateStatus' --output text

echo "done. tail logs with:"
echo "  aws logs tail /aws/lambda/$FN --follow --region $REGION"
echo "force a tick with:"
echo "  aws lambda invoke --region $REGION --function-name $FN /dev/stdout"
