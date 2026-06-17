# Infrastructure

Deploy order: **S3/R2/KMS → SSM params → IAM roles → AMI → Launch Template → Lambda + EventBridge cron**.

## 1. Buckets & keys
- **S3** `euron-uploads` (raw uploads), same region as workers (`ap-south-1`). CORS for browser PUT.
- **R2** `euron-vod` (processed output) + a Cloudflare CDN binding (`R2_PUBLIC_BASE`, e.g. `https://cdn.euron.one`). CORS `GET, HEAD` for playback.
- **KMS** customer key for wrapping per-video content keys (`KEY_KMS_KEY_ID`). Worker needs `Encrypt`/`Decrypt`.

## 2. SSM Parameter Store (runtime secrets the bootstrap pulls)
Per-environment prefix WITH a leading slash: `/euron-vod-dev` (dev), `/euron-vod-prod` (prod). Create
SecureString params under it, e.g. `/euron-vod-dev/DATABASE_URL`: `DATABASE_URL`, `PG_*`,
`UPLOAD_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_ENDPOINT`, `R2_PUBLIC_BASE`, `KEY_KMS_KEY_ID`, `PLAYBACK_TOKEN_SECRET`, `PUBLIC_API_BASE`.
The bootstrap normalizes the prefix, so the slash form does not matter, but the stored param names
themselves must be hierarchical (leading slash), which SSM requires.

## 3. IAM
- Worker role `euron-vod-worker-role` (+ instance profile `euron-vod-worker-profile`) ← `iam/worker-policy.json`. **No EC2 perms** (workers self-terminate via the OS).
- Lambda role `euron-vod-orchestrator-role` ← `iam/lambda-policy.json` (`RunInstances`, `DescribeInstances`, `PassRole` worker role, VPC ENIs for RDS).

## 4. AMI (ARM64 / aarch64, Graviton). See `ami-build.md`.
Workers are `c7g.xlarge` (Graviton3), so the AMI MUST be arm64 and all binaries aarch64. Bake:
aarch64 FFmpeg + libx264, the `packager-linux-arm64` binary, whisper.cpp built + symlinked to
`/opt/whisper.cpp/main` + model (`/opt/models/ggml-small.bin`), Node 20 (arm64), and the built worker
at `/opt/euron-vod` (`dist/` + `node_modules`). Constraint #10: bake heavy deps, do not install on boot.

## 5. Launch Template
`aws ec2 create-launch-template --launch-template-name transcoder --launch-template-data file://launch-template.json`
(fill placeholders; arm64 AMI, `c7g.xlarge`, 100 GB gp3, Spot, `InstanceInitiatedShutdownBehavior=terminate`,
tag `role=transcoder`). `UserData` = base64 of the per-env bootstrap, e.g.
`base64 -w0 infra/ami-bootstrap-dev.sh` (dev) or `infra/ami-bootstrap-prod.sh` (prod). The SSM prefix
is hardcoded in each file; the bootstrap IS the user-data, not baked into the AMI.

> Reliability option: an **EC2 Fleet** with `capacity-optimized` across `c7g.xlarge`,
> `c7g.2xlarge`, `c8g.xlarge`, `c6g.xlarge` reduces Spot interruptions. Add only if
> interruptions/capacity errors appear (§16.3).

## 6. Orchestrator Lambda + cron
- `pnpm build:lambda` → `dist-lambda/index.js` (handler `index.handler`, Node 20, in the RDS VPC/subnets).
- Env: `MAX_WORKERS`, `DIVISOR`, `LAUNCH_TEMPLATE_NAME`, `WORKER_INSTANCE_TYPE`, `WORKER_SUBNET_ID`,
  `WORKER_ROLE_TAG`, `DATABASE_URL` (prefer the RDS Proxy endpoint), `AWS_REGION`.
- EventBridge rule, every 1 minute:
  ```
  aws events put-rule --name euron-vod-orchestrator --schedule-expression "rate(1 minute)"
  aws events put-targets --rule euron-vod-orchestrator --targets "Id=1,Arn=<LAMBDA_ARN>"
  ```

## Scaling math (what the cron does each minute)
```
reap dead 'processing' rows (>10m no heartbeat, or >6h locked)
backlog  = count(status='uploaded')
running  = DescribeInstances(tag:role=transcoder, state in {pending,running})   # NOT a DB table
desired  = min(MAX_WORKERS, ceil(backlog / DIVISOR))
launch   = max(0, desired - running)                                            # scale UP only
```
Workers drain the queue, then self-terminate after `IDLE_GRACE_MS`. Fleet → 0 within
`IDLE_GRACE_MS` + one cron cycle.
