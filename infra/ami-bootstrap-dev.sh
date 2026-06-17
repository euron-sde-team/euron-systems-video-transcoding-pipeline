#!/bin/bash
#
# DEV EC2 user-data bootstrap for an ARM64 (Graviton, c7g.xlarge) transcode worker.
# SSM prefix is hardcoded to /euron-vod-dev. The prod copy is ami-bootstrap-prod.sh.
#
# Used directly as the instance UserData. Heavy deps (ffmpeg/libx264, shaka
# packager, whisper.cpp + model, node) are BAKED INTO THE AMI (see ami-build.md);
# this only pulls runtime secrets from SSM, writes .env, runs the worker, and
# guarantees the (billed) Spot instance terminates on any worker exit.
#
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH

APP_DIR=/opt/euron-vod
ENV_FILE="$APP_DIR/.env"
SSM_PREFIX=/euron-vod-dev    # DEV. Params are named /euron-vod-dev/<NAME>.

log() { echo "[bootstrap] $*"; }

# Always terminate the (Spot) box when this script ends, however it ends. The
# Lambda never terminates instances, so this is the only thing that stops an
# idle/crashed worker from billing. (Launch template sets shutdown-behavior=terminate.)
terminate() { log "terminating instance"; shutdown -h now; }
trap terminate EXIT

# ── Region from IMDSv2 ───────────────────────────────────────────────────────
TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300" || true)
REGION=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region || echo "ap-south-1")
export AWS_REGION="$REGION"
log "region=$REGION ssm_prefix=$SSM_PREFIX"

# ── Sanity: required binaries baked into the AMI ─────────────────────────────
for bin in node /usr/local/bin/ffmpeg /usr/local/bin/ffprobe /usr/local/bin/packager aws; do
  if ! command -v "$bin" >/dev/null 2>&1 && [ ! -x "$bin" ]; then
    log "FATAL: required binary missing from AMI: $bin"; exit 1   # trap terminates the box
  fi
done

# ── Pull runtime config from SSM Parameter Store into .env ───────────────────
# Worker uses the instance ROLE for S3 + KMS (no static AWS keys here). R2 is
# non-AWS, so its creds come from SSM.
write_param() {
  local name="$1" key="$2" val
  val=$(aws ssm get-parameter --with-decryption --region "$REGION" \
        --name "${SSM_PREFIX}/${name}" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

mkdir -p "$APP_DIR"
: > "$ENV_FILE"
{
  echo "NODE_ENV=production"
  echo "WORKER_DRY_RUN_SHUTDOWN=false"     # real worker: actually shut down on idle/interrupt
  echo "AWS_REGION=$REGION"
  echo "FFMPEG_BIN=/usr/local/bin/ffmpeg"
  echo "FFPROBE_BIN=/usr/local/bin/ffprobe"
  echo "SHAKA_PACKAGER_BIN=/usr/local/bin/packager"
  echo "WHISPER_BIN=/opt/whisper.cpp/main"          # stable symlink (see ami-build.md)
  echo "WHISPER_MODEL=/opt/models/ggml-small.bin"
  echo "WORK_DIR=/mnt/work"
  echo "PG_POOL_MAX=4"
} >> "$ENV_FILE"

write_param "DATABASE_URL"          "DATABASE_URL"
write_param "PG_DATABASE_HOST"      "PG_DATABASE_HOST"
write_param "PG_DATABASE_USER"      "PG_DATABASE_USER"
write_param "PG_DATABASE_PASSWORD"  "PG_DATABASE_PASSWORD"
write_param "PG_DATABASE"           "PG_DATABASE"
write_param "UPLOAD_BUCKET"         "UPLOAD_BUCKET"
write_param "R2_ACCOUNT_ID"         "R2_ACCOUNT_ID"
write_param "R2_ACCESS_KEY_ID"      "R2_ACCESS_KEY_ID"
write_param "R2_SECRET_ACCESS_KEY"  "R2_SECRET_ACCESS_KEY"
write_param "R2_BUCKET"             "R2_BUCKET"
write_param "R2_ENDPOINT"           "R2_ENDPOINT"
write_param "R2_PUBLIC_BASE"        "R2_PUBLIC_BASE"
write_param "KEY_KMS_KEY_ID"        "KEY_KMS_KEY_ID"
write_param "PLAYBACK_TOKEN_SECRET" "PLAYBACK_TOKEN_SECRET"
write_param "PUBLIC_API_BASE"       "PUBLIC_API_BASE"

chmod 600 "$ENV_FILE"

# ── Scratch space for transcodes (root EBS; see launch template volume size) ─
mkdir -p /mnt/work && chmod 777 /mnt/work

# Shaka Packager writes its manifest atomic-write temp file to $TMPDIR (default
# /tmp, a tmpfs on AL2023) then rename()s it onto the output under /mnt/work (EBS).
# A cross-filesystem rename fails with EXDEV ("generic:18"). Point TMPDIR at the
# EBS work dir so temp + output share one filesystem. (shaka's MPD writer ignores
# --temp_dir; TMPDIR is the knob it honors, verified on-box.)
export TMPDIR=/mnt/work

# ── Run the worker (as root) ─────────────────────────────────────────────────
# config/index.ts calls dotenv.config(), which loads ./.env from the CWD, so we
# run from APP_DIR and let dotenv read the file we just wrote. No env injection.
cd "$APP_DIR"
log "starting worker"
set +e
node "$APP_DIR/dist/worker/index.js"
log "worker exited code=$?"
# trap EXIT runs terminate()
