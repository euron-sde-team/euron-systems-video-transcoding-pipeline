# Production deployment of the VOD pipeline (cross-account RDS over VPC peering)

## Context
The standalone video transcoding pipeline (S3 uploads + EC2 Spot workers + Lambda orchestrator +
Postgres-as-queue + Cloudflare R2) is deployed and validated in **dev** (account `471112700629`). We
now want it in a **new prod AWS account** (`923326988569`, "euron systems prod"). The catch: prod's
Postgres lives in a **different account** (`471112700629`), reached via an **already-established VPC
peering** connection. The pipeline code is unchanged and fully cross-account-ready (it connects via
`DATABASE_URL` only; no same-account / same-VPC / region assumptions, confirmed by code review). This
doc explains how the cross-account DB connection works, what's already in place vs missing, the two
real open decisions (egress + AMI), and the ordered deploy steps. Goal right now is understanding;
nothing has been changed.

## Verified live state (read-only, both accounts, ap-south-1)

| Thing | Finding |
|---|---|
| Prod account / VPC | `923326988569`; VPC `vpc-023e898faf6ddc52c` "euron-systems-vpc" `10.0.0.0/16` |
| Peering | `pcx-0331998398156fbed` **active** -> RDS account `471112700629`, VPC `vpc-0392d38d79c45122c` `172.30.0.0/16`. CIDRs do **not** overlap. |
| Prod -> RDS routes | prod subnets route `172.30.0.0/16` via the pcx (several RTs) |
| RDS -> prod return route | RDS VPC main RT `rtb-043d97fcbb13c4ba6` routes `10.0.0.0/16` via the pcx; RDS subnets use the main RT |
| Peering DNS | RDS (accepter) side `AllowDnsResolutionFromRemoteVpc: true` -> prod resolves the RDS hostname to its **private** IP |
| Prod RDS | `euronpgprodv1.cvog8ka0ww2g.ap-south-1.rds.amazonaws.com`, in the peered VPC, **PubliclyAccessible: false**, SG `sg-08f9f0ad3d3379f1e`, status available. **No RDS Proxy.** |
| RDS SG inbound | `sg-08f9f0ad3d3379f1e` already allows TCP `5432` from `10.0.0.0/16` (the prod VPC) |
| Prod egress | IGW `igw-0a32fcfa5dfcc2b8a` present; **S3 gateway endpoint present**; **NO NAT gateway** |
| Prod pipeline resources | **greenfield**: no Spot SLR, no `euron-vod` IAM roles, no `/euron-vod*` SSM params, no launch template, no `euron-vod` Lambda, no self-owned AMI |
| Prod buckets | many `es-<env>-*` buckets exist; no VOD upload bucket yet |

**Net: the cross-account RDS network path is already fully wired** (peering + routes both ways + DNS
+ RDS SG). The prod work is creating the pipeline resources (greenfield) and closing one gap (egress).

## How the prod workers/Lambda will connect to `euronpgprodv1`
Nothing special in code: set `DATABASE_URL` (in prod SSM `/euron-vod-prod/DATABASE_URL` for workers,
and as a Lambda env var for the orchestrator) to:
```
postgresql://<vod_user>:<pass>@euronpgprodv1.cvog8ka0ww2g.ap-south-1.rds.amazonaws.com:5432/<vod_db>
```
Path of a query: worker/Lambda (in a prod subnet that has the `172.30.0.0/16 -> pcx` route) resolves
the RDS hostname (peering DNS is on) to its private `172.30.x` IP, traffic goes over the peering to
the RDS VPC, the RDS SG already permits `5432` from `10.0.0.0/16`, and the RDS VPC routes the reply
back via the pcx. The connection is private end-to-end (RDS is not publicly accessible). **The only
hard requirement on our side: place workers and the Lambda in prod subnets that carry the peering
route.** (`src/db/connection.ts` and `src/orchestrator/index.ts` both prefer `DATABASE_URL`.)

Because the RDS is **private**, you cannot `psql` it from your Mac (unlike dev's public RDS). Admin
tasks (create the VOD database, apply the schema) must run from **inside the prod VPC**, a small
bastion/EC2 in a peering-routed subnet, or from the RDS account side.

## Same as dev vs different for prod
- **Same** (mirror the dev runbook with prod names): KMS content key + alias, SSM `/euron-vod-prod/*`,
  worker + Lambda IAM roles/policies, launch template, Lambda + EventBridge cron, the bootstrap (with
  the `TMPDIR=/mnt/work` fix), R2 bucket + CORS, dual-fulfillment, scaling math.
- **Different for prod** (the deltas):
  1. **Separate accounts:** AMI, Spot SLR, and all resources are per-account, recreate in prod.
  2. **Cross-account RDS:** `DATABASE_URL` points at `euronpgprodv1` in the peered account (network
     already done); subnets MUST have the peering route.
  3. **No NAT in prod** (egress decision below).
  4. **Private RDS:** schema/DB admin from inside the VPC, not your laptop.
  5. **No RDS Proxy** (connect direct; keep `PG_POOL_MAX=4`, the bootstrap already does).
  6. Upload bucket name: **`euron-vod-uploads`** (your choice; R2 bucket stays `euron-vod`).

## Open decision 1: worker + Lambda egress (no NAT today)
Workers must reach R2 (Cloudflare, internet, mandatory, there is no AWS endpoint for R2) + SSM + KMS;
S3 is already covered by the gateway endpoint. The Lambda must reach the EC2 API + RDS.
- **Option A (recommended): public-IP workers via the IGW + an EC2 interface endpoint for the Lambda.**
  Launch workers in an IGW+peering subnet (`subnet-0926c3bd9080f8d6d` / `0eea0cf4bd426b3b1` /
  `0fcc382be21a0d5c0`, all route both `0.0.0.0/0 -> igw` and `172.30/16 -> pcx`) with a public IP
  (set on the launch template's network interface, since those subnets have auto-assign-public-IP
  OFF). Matches dev, and IGW egress has **no data-processing fee**, important because R2 uploads of
  transcoded video are large. The Lambda gets ENIs without public IPs, so add an EC2 interface
  endpoint (`com.amazonaws.ap-south-1.ec2`) so it calls RunInstances/DescribeInstances privately (it
  needs nothing else; its config is env vars + RDS over peering).
- **Option B: add a NAT gateway** in a public subnet and route the worker+Lambda subnets through it.
  Simpler/uniform and workers stay private, but **every R2 upload pays NAT data-processing (~$0.045/GB)**
  on top of egress.

## Open decision 2: the worker AMI (prod has none)
- **Option A (recommended): rebuild fresh in prod** via `infra/ami-build.md` on an arm64 builder in
  account `923326988569`. Clean, no cross-account snapshot/KMS sharing.
- **Option B: copy the dev AMI cross-account** (share `ami-0222...` + its EBS snapshots from
  `471112700629` to prod, then `copy-image`). Faster, but needs snapshot (and KMS, if encrypted) share.

## Deploy steps (prod, greenfield), use `ENV=prod`, the dev runbook (`infra/DEPLOYMENT.md`) is the base
1. **Spot SLR (once in prod account):** `aws iam create-service-linked-role --aws-service-name spot.amazonaws.com`.
2. **DB on `euronpgprodv1`:** from a prod-VPC bastion, create a dedicated database (e.g.
   `euron_systems_vod_prod_db`) + a scoped user, then apply `docs/migrations/0001_init.sql`. Capture
   the connection string for `DATABASE_URL`.
3. **S3 upload bucket** `euron-vod-uploads` (+ CORS for browser PUT). S3 gateway endpoint already
   exists in the prod VPC.
4. **R2** bucket `euron-vod` (Cloudflare) + CDN binding for `R2_PUBLIC_BASE` + the CORS policy
   (`GET,HEAD`, `AllowedHeaders:*` for Range). R/W API token.
5. **KMS** content-key CMK + `alias/euron-vod-prod`.
6. **SSM `/euron-vod-prod/*`** via `scripts/push-ssm.sh prod .env.prod` (DATABASE_URL -> euronpgprodv1,
   R2 creds, KMS id, PLAYBACK_TOKEN_SECRET, PUBLIC_API_BASE, UPLOAD_BUCKET, PG_* fallback). Do NOT push
   AWS keys (workers use the instance role).
7. **IAM**: worker role/profile `euron-vod-worker-prod-role` (from `iam/worker-policy.json`) + Lambda
   role `euron-vod-orchestrator-prod-role` (from `iam/lambda-policy.json`), `<ACCOUNT_ID>`=923326988569.
8. **Egress** per decision 1 (public-IP workers + EC2 endpoint, or NAT).
9. **AMI** per decision 2.
10. **Launch template** `euron-vod-prod-worker-template`: arm64 AMI, c7g.xlarge, worker profile, a
    **worker SG** (egress all), Spot + shutdown=terminate, 100 GB gp3, tag `role=transcoder-prod`,
    UserData = base64 of `infra/ami-bootstrap-prod.sh` (SSM prefix hardcoded `/euron-vod-prod`,
    `TMPDIR=/mnt/work` fix present), and a network interface with a public IP if Option A.
11. **Lambda** `euron-vod-orchestrator-prod` (arm64) in a peering-routed prod subnet + Lambda SG;
    env `DATABASE_URL`, `WORKER_SUBNET_ID`=(a peering+IGW subnet), `WORKER_ROLE_TAG=transcoder-prod`,
    `LAUNCH_TEMPLATE_NAME=euron-vod-prod-worker-template`, `MAX_WORKERS`, `DIVISOR`, `AWS_REGION`.
12. **EventBridge** rule `euron-vod-orchestrator-prod`, rate(1 minute) -> the Lambda.

## Verification (when executing)
- **DB reachability from prod:** on a prod-VPC instance/bastion, `nc -zv euronpgprodv1.cvog8ka0ww2g.ap-south-1.rds.amazonaws.com 5432` and a `psql ... -c 'select 1'`.
- **Orchestrator:** `aws lambda invoke --function-name euron-vod-orchestrator-prod /dev/stdout` -> expect `{"reaped":0,"backlog":0,"running":0,...}` (proves the Lambda reached RDS over the peering).
- **End-to-end:** upload via the API -> `/complete` -> a Spot worker tagged `role=transcoder-prod` launches, transcodes, packages (TMPDIR fix), uploads to R2, marks `ready`; play the DASH manifest.

## Needs your input before executing
- Egress choice (A public-IP workers / B NAT) and AMI choice (A rebuild / B copy).
- The VOD database name + a scoped DB user/password on `euronpgprodv1` (for `DATABASE_URL`), and how
  you'll run the one-time schema apply inside the prod VPC.
- `PUBLIC_API_BASE` for prod: this is the future key-minting backend you mentioned; set it to the
  planned prod API domain (or a placeholder, DASH playback works without it; only the baked native-HLS
  key URI needs it).
- A worker SG + Lambda SG in the prod VPC (egress all; no inbound needed for the RDS, the RDS SG
  already allows the `10.0.0.0/16` CIDR).

## Can Claude set up prod autonomously, given both dev + prod AWS creds? (honest assessment)
Mostly drive it, not fully hands-off in this harness. Breakdown:
- **Can do now:** read-only verification of both accounts (done), and generate every exact AWS CLI
  command, run them, and re-verify after each step. The pipeline code needs no changes.
- **Hard blockers to fully unattended execution:**
  1. **The harness safety classifier blocks infra-mutating commands.** This whole session it blocked
     my writes (`ssm put-parameter`, `iam create-service-linked-role`, `terminate-instances`, R2
     `PutBucketCors`); you ran them. So I cannot execute the prod writes unattended unless you add
     Bash allow-rules for `aws ...` (or approve per call).
  2. **Private RDS schema apply must run inside the prod VPC.** `euronpgprodv1` is private; I can't
     reach it from here. Creating the VOD DB + user + applying `0001_init.sql` needs a bastion/EC2 in
     a peering-routed prod subnet (I can drive launching it, but the psql step runs there).
  3. **AMI build runs on a builder instance** (git pull / pnpm build / rsync). I can launch it via
     CLI, but the on-box build needs SSM Run Command or you on the box.
  4. **R2 is Cloudflare (non-AWS).** Bucket creation + CDN binding is the Cloudflare dashboard; I can
     only set CORS via the S3 API with R2 creds.
  5. **Decisions only you make:** egress (A public-IP / B NAT), AMI (A rebuild / B copy), the DB name
     + user/password, and `PUBLIC_API_BASE` (the future key backend).
- **Realistic working mode:** I produce + run the exact commands and verify each step read-only; you
  (or a Bash allow-rule for `aws`) execute the gated mutations, plus the in-VPC schema apply and the
  Cloudflare R2 setup, and make the 5 decisions. With allow-rules I can run ~80-90% of the AWS
  provisioning directly; the in-VPC DB step, Cloudflare, and the decisions remain yours.

