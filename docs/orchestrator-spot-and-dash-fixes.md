# VOD pipeline — Spot orchestration + DASH playback fixes (June 2026)

Reference for two related pieces of work done in June 2026 on the standalone video pipeline:

1. **Durable multi-AZ Spot orchestration** (Lambda) — kill the single-AZ `InsufficientInstanceCapacity` stalls.
2. **DASH static-MPD fix** (worker/packager) — the `1193046:28:16` (~2^32 s) duration + unplayable DASH.

Both shipped to **dev** (`471112700629`) and **prod** (`923326988569`), `ap-south-1`.

---

## 1. Orchestrator: multi-AZ, capacity-optimized, Spot-only, c7g-preferred

### The problem
The orchestrator Lambda (`euron-vod-orchestrator-<env>`, EventBridge cron every 1 min) launched workers with
`RunInstances` into a **single subnet** + Spot. One subnet = one AZ = one Spot capacity pool. When that AZ
ran out of `c7g.xlarge` Spot, `RunInstances` threw `InsufficientInstanceCapacity` and the launch failed
every minute until that one AZ happened to free up (observed: ~4 min stalls; then a whole region-wide
shortage). Backlog sat in `uploaded`.

### The fix (code: `src/orchestrator/ec2.ts`, `src/config/index.ts`)
Launch via **EC2 `CreateFleet` (`type=instant`)** instead of `RunInstances`, with **strict instance-type
preference tiers**:

- **Tier 1** — the *preferred* type (`WORKER_INSTANCE_TYPES[0]` = `c7g.xlarge`) **alone**, across **all 3 AZ
  subnets** (`WORKER_SUBNET_IDS`). `SpotOptions.AllocationStrategy=capacity-optimized` picks the AZ with the
  deepest c7g Spot pool (fewest interruptions). It does NOT consider other types.
- **Tier 2** — only the capacity tier 1 could NOT supply spills to the remaining (fallback) types
  (`c6g.xlarge`, `m7g.xlarge`), again across all AZs. So a fallback type is used **only when c7g.xlarge is
  unavailable in every AZ**, never while c7g has room.
- **Spot-ONLY**: `ONDEMAND_FALLBACK=false` (code default false). If neither tier has Spot capacity, the tick
  launches **0** and the video stays queued; the cron retries every minute. **No On-Demand spend.** (An
  opt-in On-Demand fallback tier exists in code but is off by policy.)

> **How "is c7g.xlarge available?" is decided:** not predicted, not from price history. The orchestrator
> *asks EC2*: tier 1 calls `CreateFleet` for c7g.xlarge and EC2's allocator answers in the same call. A type
> is "available" iff the call returns instance IDs. A dry pool comes back in the response `Errors`
> (`InsufficientInstanceCapacity` / `UnfulfillableCapacity`) — `instant` fleets do NOT throw — so the code
> logs it and drops to the next tier. Real-time, authoritative.

Instances are tagged `role=<WORKER_ROLE_TAG>` by the Lambda after launch (and the LT also bakes the tag), so
`countRunningWorkers` always sees fleet instances.

### Launch-template requirements (two CreateFleet constraints)
A fleet supplies subnet + instance type as `Overrides`, which forced new LT versions:
1. **No subnet pinned in a `NetworkInterface`** — a baked `SubnetId` conflicts with the fleet's subnet
   override. Prod's subnets don't auto-assign a public IP, so its LT keeps a `NetworkInterface` with
   `AssociatePublicIpAddress:true` + `Groups` but **no `SubnetId`** (the fleet fills the subnet; the public
   IP is still assigned — verified). Dev's subnets are `MapPublicIpOnLaunch=true`, so its LT uses a plain
   top-level `SecurityGroupIds` and no `NetworkInterface`.
2. **No `InstanceMarketOptions` in the LT** — the fleet's `DefaultTargetCapacityType` decides Spot vs
   On-Demand; a baked `spot` market option breaks the (opt-in) On-Demand path.

LT versions must be created from FULL launch-template-data (not `--source-version`) when *removing* a field
like `InstanceMarketOptions`, because `--source-version` inherits unspecified fields.

### IAM
The orchestrator role needs `ec2:CreateFleet` (added alongside the existing `ec2:RunInstances`,
`DescribeInstances`, `CreateTags`; `iam:PassRole` to the worker role unchanged). See
`infra/iam/lambda-policy.json`.

### As-built config
| | Dev (`471112700629`) | Prod (`923326988569`) |
|---|---|---|
| Lambda | `euron-vod-orchestrator-dev` | `euron-vod-orchestrator-prod` |
| Trigger | EventBridge **Scheduler** `euron-vod-orchestrator-dev` (ENABLED) | EventBridge **Rule** `euron-vod-orchestrator-prod` (ENABLED, `rate(1 minute)`) |
| `WORKER_SUBNET_IDS` | `subnet-0b5f7c3746fa158d5,subnet-0ec2a4406c65c3fa0,subnet-0ceb848970d187a60` (1a/1b/1c) | `subnet-0926c3bd9080f8d6d,subnet-0fcc382be21a0d5c0,subnet-0eea0cf4bd426b3b1` (1a/1b/1c) |
| `WORKER_INSTANCE_TYPES` | `c7g.xlarge,c6g.xlarge,m7g.xlarge` | `c7g.xlarge,c6g.xlarge,m7g.xlarge` |
| `ONDEMAND_FALLBACK` | `false` | `false` |
| `SPOT_ALLOCATION_STRATEGY` | unset → code default `capacity-optimized` | unset → code default `capacity-optimized` |
| Launch template | `euron-vod-dev-worker-template` (no NI; top-level SG) | `euron-vod-prod-worker-template` (NI: public IP, no subnet) |

Networking (verified): all candidate subnets have internet egress + DB reachability. Prod VPC `10.0.0.0/16`,
all 3 subnets route `0.0.0.0/0→igw` and `172.30.0.0/16→pcx-0331998398156fbed` (cross-account RDS peering),
RDS SG allows `10.0.0.0/16`. Dev default VPC `172.31.0.0/16`, all 3 subnets `MapPublicIpOnLaunch=true`, RDS
in-VPC same SG.

### Verify / operate
```
# healthy tick (backlog 0 -> launches nothing):
aws lambda invoke --function-name euron-vod-orchestrator-<env> /dev/stdout
# is c7g.xlarge Spot available right now? (what tier 1 asks EC2)
aws ec2 create-fleet --cli-input-json '{...instant, spot, capacity-optimized, 3 subnets x c7g.xlarge, target 1...}'
#   -> returns Instances (available) or Errors=InsufficientInstanceCapacity/UnfulfillableCapacity (dry)
# logs show: "<type> gave X/N (unavailable in all AZs); falling back to ..." and "launched X/N worker(s)"
```

### Rollback
Orchestrator uses LT `$Latest`. To roll back, create a new LT version copying the old-good one (prod v4 /
dev v6 were the pre-change versions) and revert the Lambda code (the `RunInstances` path) + unset the new
env vars.

---

## 2. DASH playback: static MPD (the original `1193046:28:16` bug)

### Symptom
DASH (`.mpd`) playback showed a duration of `1193046:28:16` (= exactly **2^32 s**) and the video would not
play (black screen). HLS played fine.

### Root cause (NOT ffmpeg)
The encoded segments and the MPD's `SegmentTimeline` were perfectly correct (the real duration is recoverable
from the timeline). The bug was the **manifest type**: with `segment_template` + `$Number$` (segmented
output, which we use to share one segment tree between HLS and DASH), **Shaka Packager defaults to a LIVE
manifest**:
```
profiles="urn:mpeg:dash:profile:isoff-live:2011"  type="dynamic"
availabilityStartTime=... minimumUpdatePeriod="PT5S" timeShiftBufferDepth="PT1800S"
(NO mediaPresentationDuration)
```
Players treat that finite VOD as a *live edge*, invent a ~2^32 s duration, and can't seek/play. HLS is VOD by
construction, so it was unaffected. (The earlier ffmpeg `-t` change was a red herring — kept only as
defensive duration-bounding, it is NOT this fix.)

### The fix (code: `src/encoding/shaka.ts`)
Add one Shaka Packager flag:
```
--generate_static_live_mpd
```
It forces a **static VOD MPD**: `type="static"` + a computed `mediaPresentationDuration`, dropping all the
live attributes. Proven on the worker toolchain (packager v3.2.0):
```
without flag -> type="dynamic", no mediaPresentationDuration   (the bug)
with    flag -> type="static",  mediaPresentationDuration="PT3S"  (fixed)
```

### Deployment (worker code = AMI re-bake)
This is **worker code**, baked into the worker AMI (the bootstrap runs `/opt/euron-vod/dist`, it does not
pull code at boot). Shipping the fix:
1. Build worker `dist/` (`pnpm build`); the flag compiles into `dist/encoding/shaka.js`.
2. Put the fixed `dist/` on the dev builder's `/opt/euron-vod/dist`, `sync`.
3. `create-image` **without** `--no-reboot` (reboot flushes the FS — `--no-reboot` without a prior `sync`
   once snapshotted freshly-written files as 0 bytes; see TROUBLESHOOTING).
4. Point the dev LT at the new AMI (new version + default); copy the AMI cross-account to prod
   (`modify-image-attribute`/`modify-snapshot-attribute` share -> `copy-image` in prod) and point the prod LT
   at the prod copy.
5. **Existing `ready` videos keep their old (dynamic) MPD on R2** until re-transcoded — the fix only affects
   new transcodes. Re-transcode by resetting the row to `uploaded` (clear `locked_by`/`stage`/`heartbeat_at`,
   `attempts=0`); the orchestrator launches a fixed worker that overwrites the output prefix with a static MPD.

### Verify
```
curl -s https://<cdn>/<output_prefix>/manifest.mpd | grep -oE 'type="[^"]*"|mediaPresentationDuration="[^"]*"'
# want: type="static"  mediaPresentationDuration="PT<real>S"
```

---

## Files touched
- `src/orchestrator/ec2.ts` — CreateFleet, tiered preference, Spot-only, tagging.
- `src/config/index.ts` — `WORKER_SUBNET_IDS`, `WORKER_INSTANCE_TYPES` (priority-ordered),
  `SPOT_ALLOCATION_STRATEGY`, `ONDEMAND_FALLBACK`.
- `src/encoding/shaka.ts` — `--generate_static_live_mpd`.
- `src/encoding/ffmpeg.ts` — corrected the misleading `-t` comment.
- `infra/iam/lambda-policy.json` — `ec2:CreateFleet`.
- `infra/launch-template.json`, `infra/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`, `.env.example` — docs.

## Security note
AWS access keys for both accounts were pasted into a chat transcript during this work and **must be
rotated**.
