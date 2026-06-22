# Deploying the pipeline (identical dev and prod)

Dev and prod use the **same architecture**: API + orchestrator Lambda (EventBridge cron) + EC2 Spot
worker fleet (baked AMI) + KMS-wrapped content keys + SSM secrets + RDS. They differ ONLY by the
values in the table below (which VPC, buckets, DB, SSM prefix, KMS key, IAM role names, tags). Run
this whole runbook once for `dev` now; re-run it with the prod column later. No dev shortcuts.

Every step shows the **AWS Console** path and the equivalent **CLI**. The CLI uses shell variables so
you set them once per environment and paste the rest unchanged.

> When something breaks, see **`docs/TROUBLESHOOTING.md`**, it lists every real failure hit bringing
> this up (Spot service-linked role, missing launch-template UserData, the shaka `TMPDIR`/EXDEV
> packaging fix, R2 CORS, the ngrok key-URI interstitial, `$Latest` vs `$Default`, scaling/reaper
> behavior) with verified root causes and fixes.

---

## 0. Naming convention (every resource carries the env)

Keeping the env in every name (and in the worker tag) is what lets one AWS account run both fleets
without the dev Lambda counting prod workers or vice versa.

| Resource | Dev | Prod |
|----------|-----|------|
| S3 upload bucket | `euron-vod-uploads-dev` | `euron-vod-uploads` |
| R2 output bucket | `euron-vod-dev` | `euron-vod` |
| SSM prefix | `/euron-vod-dev` | `/euron-vod` |
| KMS alias (content keys) | `alias/euron-vod-dev` | `alias/euron-vod` |
| Worker IAM role + profile | `euron-vod-worker-dev-role` | `euron-vod-worker-role` |
| Lambda IAM role | `euron-vod-orchestrator-dev-role` | `euron-vod-orchestrator-role` |
| Launch template | `euron-vod-dev-worker-template` | `euron-vod-worker-template` |
| Lambda function | `euron-vod-orchestrator-dev` | `euron-vod-orchestrator` |
| EventBridge rule | `euron-vod-orchestrator-dev` | `euron-vod-orchestrator` |
| Worker instance tag `role` | `transcoder-dev` | `transcoder` |

> The worker tag value MUST differ per env. The Lambda sets it (`WORKER_ROLE_TAG`) on launch AND
> filters `DescribeInstances` by it when counting running workers, so distinct tags keep the two
> fleets from being counted together.

The **AMI is environment-agnostic** (it bakes only binaries + the worker build, never secrets). Build
it once and use it for both dev and prod; the per-env launch template injects the SSM prefix at boot.

---

## 1. Set your shell variables (per environment)

Set these for dev now. To deploy prod later, change the values and re-run the same commands.
```
export ENV=dev
export REGION=ap-south-1
export ACCOUNT_ID=<AWS_ACCOUNT_ID>

export VPC_ID=<DEV_VPC_ID>
export WORKER_SUBNETS=<DEV_SUBNET_IDS_CSV>     # ONE per AZ, each with internet egress (NAT or
                                               # public) AND DB reachability; the fleet spreads
                                               # across all of them so one AZ's Spot can't block it
export LAMBDA_SUBNETS=<DEV_PRIVATE_SUBNET_IDS_CSV>

export UPLOAD_BUCKET=euron-vod-uploads-$ENV
export SSM_PREFIX=/euron-vod-$ENV
export KMS_ALIAS=alias/euron-vod-$ENV
export WORKER_ROLE=euron-vod-worker-$ENV-role
export LAMBDA_ROLE=euron-vod-orchestrator-$ENV-role
export LT_NAME=euron-vod-$ENV-worker-template
export FN_NAME=euron-vod-orchestrator-$ENV
export ROLE_TAG=transcoder-$ENV

export DATABASE_URL='postgresql://USER:PASS@<DEV_RDS_OR_PROXY_HOST>:5432/euron_video_pipeline'
```

---

## 2. Networking prerequisites (one-time per VPC, you already have the VPCs)

- The **worker subnet** needs outbound internet for R2 + SSM + KMS (NAT gateway, or public subnet +
  auto public IP). Add an **S3 gateway endpoint** so source downloads are free:
  - Console: VPC -> Endpoints -> Create endpoint -> service `com.amazonaws.<region>.s3` (Gateway) ->
    select the VPC + the worker subnet's route table.
  - CLI:
    ```
    aws ec2 create-vpc-endpoint --region $REGION --vpc-id $VPC_ID \
      --service-name com.amazonaws.$REGION.s3 --vpc-endpoint-type Gateway \
      --route-table-ids <WORKER_ROUTE_TABLE_ID>
    ```
- The **Lambda** runs in the VPC to reach RDS, so its subnets also need NAT or an `ec2` interface
  endpoint (the Lambda calls the EC2 API).
- Security groups: create a worker SG (egress all) and a Lambda SG, and allow both to reach Postgres
  on 5432 on the RDS/RDS-Proxy SG.
  - Console: EC2 -> Security Groups -> Create (one for `euron-vod-worker-$ENV`, one for
    `euron-vod-lambda-$ENV`); on the RDS SG add inbound TCP 5432 from each.
  - CLI:
    ```
    export WORKER_SG=$(aws ec2 create-security-group --region $REGION --vpc-id $VPC_ID \
      --group-name euron-vod-worker-$ENV --description "VOD workers $ENV" --query GroupId --output text)
    export LAMBDA_SG=$(aws ec2 create-security-group --region $REGION --vpc-id $VPC_ID \
      --group-name euron-vod-lambda-$ENV --description "VOD orchestrator $ENV" --query GroupId --output text)
    aws ec2 authorize-security-group-ingress --region $REGION --group-id <RDS_SG_ID> \
      --protocol tcp --port 5432 --source-group $WORKER_SG
    aws ec2 authorize-security-group-ingress --region $REGION --group-id <RDS_SG_ID> \
      --protocol tcp --port 5432 --source-group $LAMBDA_SG
    ```

Apply the schema to this env's DB once:
```
psql "$DATABASE_URL" -f docs/migrations/0001_init.sql
```

**EC2 Spot service-linked role (one-time per AWS account, before the first Spot launch):** the
orchestrator launches Spot instances, and the first-ever Spot launch in the account needs the
`AWSServiceRoleForEC2Spot` service-linked role. The Lambda role can't auto-create it, so create it
once (account-wide, not attached to anything, serves both dev and prod):
```
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com
```
Console: IAM -> Roles -> Create role -> AWS service -> EC2 -> "EC2 - Spot Instances". Skipping this
makes the Lambda fail with `AuthFailure.ServiceLinkedRoleCreationNotPermitted`.

---

## 3. S3 upload bucket

**Console:** S3 -> Create bucket -> name `euron-vod-uploads-dev`, region, Block all public access ON ->
Create. Permissions -> CORS -> Edit -> paste the JSON below.
**CLI:**
```
aws s3api create-bucket --bucket $UPLOAD_BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-bucket-cors --bucket $UPLOAD_BUCKET --cors-configuration \
  '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["POST","PUT","GET","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]}'
```

## 4. Cloudflare R2 output bucket (per env)

Cloudflare dashboard -> R2 -> Create bucket `euron-vod-dev` -> bind a CDN hostname (custom domain or
r2.dev) for `R2_PUBLIC_BASE` -> R2 -> Manage API Tokens -> create an **Object Read and Write** token;
note Access Key ID, Secret, and Account ID. (R2 is not in AWS; the worker reaches it with these
S3-compatible creds, pulled from SSM in step 6.)

Set the bucket **CORS policy** (Settings -> CORS, or the S3 `PutBucketCors` API). `AllowedHeaders: *`
is required because the browser fetches segments with a `Range` header (which preflights); without
CORS, playback fails with Shaka `Error 1002` on `master.m3u8`:
```
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET","HEAD"], "AllowedHeaders": ["*"],
   "ExposeHeaders": ["Content-Length","Content-Range","ETag","Accept-Ranges"], "MaxAgeSeconds": 3600 }]
```
Tighten `AllowedOrigins` to your real app domains in prod (wildcard is fine for dev).

## 5. KMS key for content-key wrapping (per env)

**Console:** KMS -> Customer managed keys -> Create key -> Symmetric, Encrypt and decrypt -> alias
`euron-vod-dev` -> set key admins/users -> Create. Copy the key ARN.
**CLI:**
```
export KMS_KEY_ID=$(aws kms create-key --region $REGION \
  --description "Euron VOD content-key wrapping ($ENV)" --query KeyMetadata.KeyId --output text)
aws kms create-alias --region $REGION --alias-name $KMS_ALIAS --target-key-id $KMS_KEY_ID
export KMS_KEY_ARN=$(aws kms describe-key --region $REGION --key-id $KMS_KEY_ID --query KeyMetadata.Arn --output text)
```

## 6. SSM Parameter Store (runtime secrets the worker bootstrap pulls)

**Console:** Systems Manager -> Parameter Store -> Create parameter -> type SecureString -> name
`/euron-vod-dev/DATABASE_URL` -> value -> Create. Repeat for each key below.
**CLI:**
```
put(){ aws ssm put-parameter --region $REGION --type SecureString --overwrite --name "$SSM_PREFIX/$1" --value "$2"; }
put DATABASE_URL "$DATABASE_URL"
put PG_DATABASE_HOST "<DEV_RDS_HOST>"; put PG_DATABASE_USER "<USER>"; put PG_DATABASE_PASSWORD "<PASS>"; put PG_DATABASE "euron_video_pipeline"
put UPLOAD_BUCKET "$UPLOAD_BUCKET"
put R2_ACCOUNT_ID "<R2_ACCOUNT_ID>"; put R2_ACCESS_KEY_ID "<R2_KEY>"; put R2_SECRET_ACCESS_KEY "<R2_SECRET>"
put R2_BUCKET "euron-vod-$ENV"; put R2_ENDPOINT "https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
put R2_PUBLIC_BASE "https://cdn-$ENV.euron.one"
put KEY_KMS_KEY_ID "$KMS_KEY_ID"
put PLAYBACK_TOKEN_SECRET "<SAME_HS256_SECRET_AS_THE_API>"
put PUBLIC_API_BASE "https://video-$ENV.euron.one"
```
> Shortcut: `scripts/push-ssm.sh <env> [env-file]` pushes all of these from a local `.env`. Runtime
> prefers `DATABASE_URL` (the `PG_*` are a fallback that defaults to `localhost` if BOTH are empty),
> so `DATABASE_URL` alone covers the DB; push the `PG_*` too for safety. `AWS_S3_*` are intentionally
> NOT pushed, the worker uses its instance role for S3 + KMS.

## 7. IAM roles (per env)

**Console (worker):** IAM -> Roles -> Create role -> AWS service -> EC2 -> name
`euron-vod-worker-dev-role` -> open it -> Add permissions -> Create inline policy -> JSON -> paste
`infra/iam/worker-policy.json` with placeholders substituted (`<ACCOUNT_ID>`, `<UPLOAD_BUCKET>`,
`<SSM_PREFIX>` = `euron-vod-dev`, `<KEY_KMS_KEY_ARN>`, `<SSM_KMS_KEY_ARN>` = the AWS-managed
`aws/ssm` key ARN or your CMK). The console auto-creates a matching instance profile.
**Console (lambda):** IAM -> Roles -> Create role -> AWS service -> Lambda -> name
`euron-vod-orchestrator-dev-role` -> inline policy from `infra/iam/lambda-policy.json` (substitute
`<ACCOUNT_ID>`, `<WORKER_ROLE_NAME>` = `euron-vod-worker-dev-role`).
**CLI:**
```
# substitute placeholders into the policy files for this env, then:
sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s#<UPLOAD_BUCKET>#$UPLOAD_BUCKET#g" \
    -e "s#<SSM_PREFIX>#euron-vod-$ENV#g" -e "s#<KEY_KMS_KEY_ARN>#$KMS_KEY_ARN#g" \
    -e "s#<SSM_KMS_KEY_ARN>#$KMS_KEY_ARN#g" infra/iam/worker-policy.json > /tmp/worker-$ENV.json
sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s/<WORKER_ROLE_NAME>/$WORKER_ROLE/g" \
    infra/iam/lambda-policy.json > /tmp/lambda-$ENV.json

cat > /tmp/ec2-trust.json <<'J'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
J
cat > /tmp/lambda-trust.json <<'J'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
J
aws iam create-role --role-name $WORKER_ROLE --assume-role-policy-document file:///tmp/ec2-trust.json
aws iam put-role-policy --role-name $WORKER_ROLE --policy-name worker --policy-document file:///tmp/worker-$ENV.json
aws iam create-instance-profile --instance-profile-name $WORKER_ROLE
aws iam add-role-to-instance-profile --instance-profile-name $WORKER_ROLE --role-name $WORKER_ROLE

aws iam create-role --role-name $LAMBDA_ROLE --assume-role-policy-document file:///tmp/lambda-trust.json
aws iam put-role-policy --role-name $LAMBDA_ROLE --policy-name orchestrator --policy-document file:///tmp/lambda-$ENV.json
```

## 8. AMI (build once, shared by both envs): ARM64

Workers are `c7g.xlarge` (Graviton3), so the AMI MUST be **arm64** and all baked binaries aarch64.
Follow `infra/ami-build.md` on an Amazon Linux 2023 arm64 builder: install the aarch64 ffmpeg+libx264
static build, the `packager-linux-arm64` binary, whisper.cpp (built + symlinked to
`/opt/whisper.cpp/main`), Node 20 arm64, and the built worker at `/opt/euron-vod`. Create the image
and confirm `Architecture == arm64`; note `<AMI_ID>`. It holds no secrets, so the same `<AMI_ID>`
serves both dev and prod.

## 9. Launch template (per env)

The whole bootstrap is the UserData (not baked). There is one static file per env with the SSM prefix
hardcoded, so there is nothing to template: use `infra/ami-bootstrap-dev.sh` for dev and
`infra/ami-bootstrap-prod.sh` for prod (i.e. `infra/ami-bootstrap-$ENV.sh`).
**Console:** EC2 -> Launch Templates -> Create launch template `euron-vod-dev-worker-template` -> AMI `<AMI_ID>`
(arm64), type `c7g.xlarge`, instance profile `euron-vod-worker-dev-role`, security group the worker
SG, storage 100 GB gp3, Advanced: request Spot + Shutdown behavior `Terminate`, tag
`role=transcoder-dev`, paste the contents of `infra/ami-bootstrap-dev.sh` as User data.
**CLI:** edit `infra/launch-template.json` (set `<AMI_ID>`, the worker SG, tag value
`transcoder-$ENV`, and `UserData` = `base64 -i infra/ami-bootstrap-$ENV.sh` on macOS or
`base64 -w0 infra/ami-bootstrap-$ENV.sh` on Linux), then:
```
aws ec2 create-launch-template --region $REGION --launch-template-name $LT_NAME \
  --launch-template-data file://infra/launch-template.json
```
The orchestrator launches via **EC2 CreateFleet** (type `instant`) and supplies the subnet +
instance-type as fleet `Overrides`, so this template MUST NOT:
- set `InstanceMarketOptions` (the fleet's `DefaultTargetCapacityType` decides Spot vs On-Demand; a
  baked `spot` breaks the On-Demand fallback), or
- pin a `SubnetId` inside a `NetworkInterface` (it conflicts with the fleet's subnet override).

For subnets that do **not** auto-assign a public IP (e.g. prod's private-style public subnets), give a
`NetworkInterface` with `AssociatePublicIpAddress:true` + `Groups` but **no** `SubnetId` (the fleet
fills the subnet). For subnets with `MapPublicIpOnLaunch=true` (e.g. dev), use top-level
`SecurityGroupIds` and no `NetworkInterface`. Bake the per-env `role` tag in `TagSpecifications` so it
applies to fleet-launched instances. All instance types in `WORKER_INSTANCE_TYPES` must match the AMI
arch (arm64 -> Graviton).

> Updating later (new AMI or edited bootstrap): create a new launch-template version, then make it the
> default. The orchestrator uses `LAUNCH_TEMPLATE_VERSION=$Latest` (highest number) so it picks up new
> versions automatically, but `$Latest` is NOT `$Default`, the console shows the default, so set it too
> to avoid confusion: `aws ec2 modify-launch-template --launch-template-name $LT_NAME --default-version <n>`.
> A worker **code** change needs a new AMI (re-bake); a **bootstrap/UserData** change is just a new
> version with updated `UserData` (no re-bake). See `docs/TROUBLESHOOTING.md` for the fast re-bake flow.

## 10. Orchestrator Lambda (per env)

```
pnpm build:lambda && ( cd dist-lambda && zip -r ../orchestrator.zip index.js )
```
The Lambda bundle is pure JS (esbuild; `pg` has no native addons), so it runs on an **arm64** Lambda
too (cheaper, and keeps the whole system on ARM). x86_64 also works if you prefer.
**Console:** Lambda -> Create function -> Author from scratch -> name `euron-vod-orchestrator-dev`,
Node.js 20.x, Architecture `arm64` -> Create. Upload `orchestrator.zip`. Configuration:
- General: Handler `index.handler`, Timeout 60s, Memory 256 MB.
- Permissions: use existing role `euron-vod-orchestrator-dev-role`.
- VPC: select the dev VPC, the Lambda subnets, the Lambda SG.
- Environment variables: see the CLI block.
**CLI:**
```
aws lambda create-function --region $REGION --function-name $FN_NAME \
  --runtime nodejs20.x --architectures arm64 --handler index.handler \
  --role arn:aws:iam::$ACCOUNT_ID:role/$LAMBDA_ROLE \
  --zip-file fileb://orchestrator.zip --timeout 60 --memory-size 256 \
  --vpc-config SubnetIds=$LAMBDA_SUBNETS,SecurityGroupIds=$LAMBDA_SG \
  --environment "Variables={DATABASE_URL=$DATABASE_URL,AWS_REGION=$REGION,\
MAX_WORKERS=5,DIVISOR=2,LAUNCH_TEMPLATE_NAME=$LT_NAME,LAUNCH_TEMPLATE_VERSION=\$Latest,\
WORKER_INSTANCE_TYPES=c7g.xlarge,c6g.xlarge,m7g.xlarge,WORKER_SUBNET_IDS=$WORKER_SUBNETS,\
SPOT_ALLOCATION_STRATEGY=capacity-optimized,ONDEMAND_FALLBACK=false,WORKER_ROLE_TAG=$ROLE_TAG}"
# redeploy code later:
aws lambda update-function-code --region $REGION --function-name $FN_NAME --zip-file fileb://orchestrator.zip
```
Keep `MAX_WORKERS` modest on dev (e.g. 5). It is the only setting you might intentionally differ from
prod; everything else is identical.

> The API service (separate process, wherever you run it) needs **Node 20.19+ or Node 22+** (it uses
> an ESM-only dep via require). The worker needs only Node 20+ (it does not use that dep). The AMI's
> NodeSource Node 20.x satisfies both.

## 11. EventBridge cron (per env)

**Console:** EventBridge -> Rules -> Create rule `euron-vod-orchestrator-dev` -> Schedule -> rate
`1 minute` -> Target = the Lambda.
**CLI:**
```
RULE_ARN=$(aws events put-rule --region $REGION --name $FN_NAME \
  --schedule-expression "rate(1 minute)" --query RuleArn --output text)
aws lambda add-permission --region $REGION --function-name $FN_NAME --statement-id evb \
  --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN"
aws events put-targets --region $REGION --rule $FN_NAME \
  --targets "Id=1,Arn=arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FN_NAME"
```

## 12. End-to-end test (this env)

1. `aws lambda invoke --region $REGION --function-name $FN_NAME /dev/stdout` ->
   `{"reaped":0,"backlog":0,"running":0,"desired":0,"toLaunch":0}`.
2. Upload a video through the API (`POST /videos/uploads`, PUT to the presigned POST,
   `POST /videos/:id/complete`). Backlog becomes 1.
3. Within ~1 min a Spot worker tagged `role=transcoder-dev` appears
   (`aws ec2 describe-instances --filters Name=tag:role,Values=$ROLE_TAG Name=instance-state-name,Values=pending,running`).
4. It transcodes, uploads to R2, marks `ready`. Poll `GET /videos/:id`.
5. Queue drains, the worker self-terminates after `IDLE_GRACE_MS`; fleet returns to 0.
6. Kill test: terminate the worker mid-job; the next Lambda run (within the 10-minute stale window)
   reaps the row back to `uploaded` and another worker reprocesses it.

To stand up prod, change the variables in step 1 to the prod column, reuse the same `<AMI_ID>`, and
run steps 2 through 11 again.
```
