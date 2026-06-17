# Deploy the orchestrator Lambda (DEV): Console + CLI

The orchestrator is an AWS Lambda on a 1-minute EventBridge cron. Each run it: reaps stale jobs,
counts the `uploaded` backlog in Postgres, counts running workers via the EC2 API, and launches Spot
workers from the launch template if the backlog needs them. It scales UP only; workers self-terminate.

Prereqs (you have these): the arm64 AMI, the `transcoder-dev` launch template, the worker role +
instance profile, and the `/euron-vod-dev/*` SSM params.

## Values (dev, prefilled)

| Name | Value |
|------|-------|
| Region | `ap-south-1` |
| Account | `471112700629` |
| Function | `euron-vod-orchestrator-dev` |
| Lambda role | `euron-vod-orchestrator-dev-role` |
| Worker role (for PassRole) | `euron-vod-worker-dev-role` (the role on your worker instance profile) |
| Launch template | `transcoder-dev` |
| Worker tag | `role=transcoder-dev` |
| Instance type | `c7g.xlarge` |
| Worker subnet | `<WORKER_SUBNET_ID>` (a subnet that reaches RDS) |
| Lambda SG | `<SG_ID>` (allowed on the RDS SG, port 5432; can reuse the worker SG) |
| DATABASE_URL | `postgresql://euronpgdev:<pw>@euronpgdev2.cvog8ka0ww2g.ap-south-1.rds.amazonaws.com:5432/euron_systems_vod_dev_db` |

Set these once for the CLI path:
```
ACCOUNT=471112700629
REGION=ap-south-1
WORKER_ROLE=euron-vod-worker-dev-role
SUBNET=<WORKER_SUBNET_ID>
SG=<SG_ID>
DBURL='postgresql://euronpgdev:<pw>@euronpgdev2.cvog8ka0ww2g.ap-south-1.rds.amazonaws.com:5432/euron_systems_vod_dev_db'
```

---

## Step 1: bundle the code (your Mac)

```
pnpm build:lambda
( cd dist-lambda && zip -r ../orchestrator.zip index.js )
```
Produces `orchestrator.zip` (handler `index.handler`).

---

## Step 2: IAM role for the Lambda

The role needs: launch/describe EC2, `iam:PassRole` on the worker role, logs, and VPC ENI perms.

### CLI
```
cat > /tmp/lambda-trust.json <<'J'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
J
aws iam create-role --role-name euron-vod-orchestrator-dev-role \
  --assume-role-policy-document file:///tmp/lambda-trust.json

cat > /tmp/lambda-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid":"ScaleUpWorkers","Effect":"Allow",
      "Action":["ec2:RunInstances","ec2:DescribeInstances","ec2:CreateTags"],"Resource":"*" },
    { "Sid":"PassWorkerRole","Effect":"Allow","Action":["iam:PassRole"],
      "Resource":"arn:aws:iam::${ACCOUNT}:role/${WORKER_ROLE}" },
    { "Sid":"Logs","Effect":"Allow",
      "Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"*" },
    { "Sid":"VpcEni","Effect":"Allow",
      "Action":["ec2:CreateNetworkInterface","ec2:DescribeNetworkInterfaces","ec2:DeleteNetworkInterface"],
      "Resource":"*" }
  ]
}
JSON
aws iam put-role-policy --role-name euron-vod-orchestrator-dev-role \
  --policy-name orchestrator --policy-document file:///tmp/lambda-policy.json
```

### Console
1. IAM -> Roles -> Create role.
2. Trusted entity type: AWS service. Use case: Lambda. Next.
3. Skip attaching managed policies. Next. Role name: `euron-vod-orchestrator-dev-role`. Create role.
4. Open the role -> Add permissions -> Create inline policy -> JSON tab -> paste the policy JSON above
   (the `Statement` array). Next -> name it `orchestrator` -> Create policy.

---

## Step 3: networking (the common gotcha)

The Lambda runs INSIDE the VPC to reach RDS, and a VPC Lambda has no internet by default. It also
needs to call the EC2 API. So the Lambda's subnet needs EITHER a NAT gateway OR an `ec2` interface
endpoint, or `DescribeInstances`/`RunInstances` will hang until timeout.

- If your VPC already has a NAT gateway and the worker subnet routes through it: nothing to do.
- Otherwise add an EC2 interface endpoint:
  - **Console:** VPC -> Endpoints -> Create endpoint -> Service: search `ec2`, pick
    `com.amazonaws.ap-south-1.ec2` (type Interface) -> select your VPC + the worker subnet(s) + a
    security group allowing inbound 443 -> Create.
  - **CLI:**
    ```
    aws ec2 create-vpc-endpoint --region $REGION --vpc-endpoint-type Interface \
      --service-name com.amazonaws.$REGION.ec2 --vpc-id <VPC_ID> \
      --subnet-ids $SUBNET --security-group-ids $SG --private-dns-enabled
    ```
- Security group `$SG`: must be allowed inbound on the RDS security group, port 5432 (reuse the
  worker SG if it already has that).

---

## Step 4: create + configure the function

### CLI
```
aws lambda create-function --region $REGION --function-name euron-vod-orchestrator-dev \
  --runtime nodejs20.x --architectures arm64 --handler index.handler \
  --role arn:aws:iam::${ACCOUNT}:role/euron-vod-orchestrator-dev-role \
  --zip-file fileb://orchestrator.zip --timeout 60 --memory-size 256 \
  --vpc-config SubnetIds=$SUBNET,SecurityGroupIds=$SG \
  --environment "Variables={DATABASE_URL=$DBURL,MAX_WORKERS=5,DIVISOR=2,LAUNCH_TEMPLATE_NAME=transcoder-dev,LAUNCH_TEMPLATE_VERSION=\$Latest,WORKER_INSTANCE_TYPE=c7g.xlarge,WORKER_SUBNET_ID=$SUBNET,WORKER_ROLE_TAG=transcoder-dev}"
```

### Console
1. Lambda -> Create function -> Author from scratch.
2. Function name `euron-vod-orchestrator-dev`. Runtime `Node.js 20.x`. Architecture `arm64`.
3. Permissions -> Change default execution role -> Use an existing role ->
   `euron-vod-orchestrator-dev-role`. Create function.
4. Code tab -> Upload from -> `.zip file` -> select `orchestrator.zip` -> Save.
5. Code tab -> Runtime settings -> Edit -> Handler = `index.handler` -> Save.
6. Configuration -> General configuration -> Edit -> Timeout `1 min 0 sec`, Memory `256 MB` -> Save.
7. Configuration -> VPC -> Edit -> VPC = your dev VPC, Subnets = the worker subnet, Security groups =
   `$SG` -> Save.
8. Configuration -> Environment variables -> Edit -> add these keys:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | your RDS URL (the `$DBURL` above) |
   | `MAX_WORKERS` | `5` |
   | `DIVISOR` | `2` |
   | `LAUNCH_TEMPLATE_NAME` | `transcoder-dev` |
   | `LAUNCH_TEMPLATE_VERSION` | `$Latest` |
   | `WORKER_INSTANCE_TYPE` | `c7g.xlarge` |
   | `WORKER_SUBNET_ID` | your worker subnet id |
   | `WORKER_ROLE_TAG` | `transcoder-dev` |

> Do NOT add `AWS_REGION`, it is reserved and set automatically by Lambda (to ap-south-1).
> `LAUNCH_TEMPLATE_NAME` and `WORKER_ROLE_TAG` MUST match your launch template name and its `role`
> tag exactly, the Lambda tags + counts workers by that tag.

---

## Step 5: 1-minute cron (EventBridge)

### CLI
```
RULE_ARN=$(aws events put-rule --region $REGION --name euron-vod-orchestrator-dev \
  --schedule-expression "rate(1 minute)" --query RuleArn --output text)
aws lambda add-permission --region $REGION --function-name euron-vod-orchestrator-dev \
  --statement-id evb --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN"
aws events put-targets --region $REGION --rule euron-vod-orchestrator-dev \
  --targets "Id=1,Arn=arn:aws:lambda:${REGION}:${ACCOUNT}:function:euron-vod-orchestrator-dev"
```

### Console
1. Amazon EventBridge -> Rules -> Create rule.
2. Name `euron-vod-orchestrator-dev`. Rule type: Schedule. Continue (or use EventBridge Scheduler).
3. Schedule pattern: Rate-based, every `1` minute. Next.
4. Target: AWS service -> Lambda function -> `euron-vod-orchestrator-dev`. Next -> Create.
   (The console adds the invoke permission for you.)

---

## Step 6: test

### Invoke directly (no video needed)
- **Console:** open the function -> Test tab -> create a test event with body `{}` -> Test.
- **CLI:** `aws lambda invoke --region $REGION --function-name euron-vod-orchestrator-dev /dev/stdout`

Expected result: `{"reaped":0,"backlog":0,"running":0,"desired":0,"toLaunch":0}`.
- Returns that JSON -> DB + EC2 API reachable, wiring is correct.
- Times out at 60s -> the subnet cannot reach the EC2 API (add NAT or the ec2 endpoint, Step 3).
- DB connect error -> the SG/subnet cannot reach RDS (fix the RDS SG rule).

### Real end-to-end
With your API running, upload a clip so a row reaches `uploaded`:
```
./scripts/dev-upload.sh sample.mp4
```
Within a minute the Lambda launches a Spot worker; watch:
```
aws ec2 describe-instances --region $REGION \
  --filters Name=tag:role,Values=transcoder-dev Name=instance-state-name,Values=pending,running \
  --query 'Reservations[].Instances[].InstanceId'
```
The worker processes the video, marks it `ready`, and self-terminates.

---

## Redeploy code later (one command)

```
./scripts/deploy-lambda.sh dev
```
Bundles and pushes new code to `euron-vod-orchestrator-dev`. Config (env, VPC, role) is unchanged.

## Logs
```
aws logs tail /aws/lambda/euron-vod-orchestrator-dev --follow --region ap-south-1
```
Each run logs: `reaped=.. backlog=.. running=.. desired=.. toLaunch=..`.
