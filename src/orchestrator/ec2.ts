import {
  CreateFleetCommand,
  CreateTagsCommand,
  DescribeInstancesCommand,
  EC2Client,
  type CreateFleetCommandInput,
  type FleetLaunchTemplateOverridesRequest,
  type SpotAllocationStrategy,
  type _InstanceType,
} from "@aws-sdk/client-ec2";
import config from "../config";
import logger from "../utils/logger";

const ec2 = new EC2Client({ region: config.AWS_REGION });

/**
 * Count workers from EC2, NOT a DB table (constraint #5). `pending` (booting)
 * MUST be counted alongside `running`, or the Lambda relaunches a whole fleet
 * every minute while the first batch is still booting. A self-reported DB table
 * would go stale the instant a Spot instance is reclaimed.
 */
export const countRunningWorkers = async (): Promise<number> => {
  const res = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:role", Values: [config.WORKER_ROLE_TAG] },
        { Name: "instance-state-name", Values: ["pending", "running"] },
      ],
    })
  );
  let count = 0;
  for (const reservation of res.Reservations ?? []) {
    count += (reservation.Instances ?? []).length;
  }
  return count;
};

/**
 * Fleet overrides = the cartesian product of the GIVEN instance types and every
 * worker subnet (one per AZ). Each (subnet, type) pair is a distinct Spot capacity
 * pool; handing the fleet all the pools for a tier lets capacity-optimized
 * allocation pick the deepest one and route around an exhausted AZ instead of
 * failing with InsufficientInstanceCapacity. An empty subnet list degrades
 * gracefully to "let the launch template / default subnet decide", but normal
 * deployments always populate WORKER_SUBNET_IDS.
 */
const buildOverrides = (instanceTypes: string[]): FleetLaunchTemplateOverridesRequest[] => {
  const subnets = config.WORKER_SUBNET_IDS.length ? config.WORKER_SUBNET_IDS : [undefined];
  const overrides: FleetLaunchTemplateOverridesRequest[] = [];
  for (const subnet of subnets) {
    for (const instanceType of instanceTypes) {
      overrides.push({
        ...(subnet ? { SubnetId: subnet } : {}),
        InstanceType: instanceType as _InstanceType,
      });
    }
  }
  return overrides;
};

/**
 * `instant` fleet: synchronous, returns the launched instance IDs (and any
 * per-pool errors) in the response instead of managing capacity over time. The
 * launch template carries everything fixed (AMI, IAM profile, SG, public-IP NIC,
 * shutdown=terminate); we override only the cost/capacity knobs here. NOTE the
 * LT must NOT set InstanceMarketOptions, the fleet's DefaultTargetCapacityType is
 * what decides Spot vs On-Demand.
 */
const fleetInput = (
  count: number,
  useSpot: boolean,
  instanceTypes: string[]
): CreateFleetCommandInput => ({
  Type: "instant",
  TargetCapacitySpecification: {
    TotalTargetCapacity: count,
    DefaultTargetCapacityType: useSpot ? "spot" : "on-demand",
  },
  ...(useSpot
    ? {
        // capacity-optimized = within THIS tier's pools (one type across the AZs),
        // pick the AZ with the deepest Spot capacity (fewest interruptions). It does
        // NOT choose between types -- the strict type preference lives in the tiering
        // in launchWorkers, not in the allocation strategy.
        SpotOptions: {
          AllocationStrategy: config.SPOT_ALLOCATION_STRATEGY as SpotAllocationStrategy,
        },
      }
    : { OnDemandOptions: { AllocationStrategy: "lowest-price" } }),
  LaunchTemplateConfigs: [
    {
      LaunchTemplateSpecification: {
        LaunchTemplateName: config.LAUNCH_TEMPLATE_NAME,
        Version: config.LAUNCH_TEMPLATE_VERSION,
      },
      Overrides: buildOverrides(instanceTypes),
    },
  ],
});

/**
 * Ask EC2 to launch `count` of ONLY `instanceTypes`, across all AZs, right now.
 * This IS the availability check: CreateFleet (type=instant) returns synchronously
 * with the instances EC2 actually launched. A type is "available" iff this returns
 * instance IDs. Pools with no capacity come back in `Errors`
 * (InsufficientInstanceCapacity / UnfulfillableCapacity), NOT as a thrown
 * exception, so we log each and return what we got -- the caller falls to the next
 * tier. No guessing, no stale price-history: EC2's allocator answers in real time.
 */
const createFleet = async (
  count: number,
  useSpot: boolean,
  instanceTypes: string[],
  label: string
): Promise<string[]> => {
  try {
    const res = await ec2.send(new CreateFleetCommand(fleetInput(count, useSpot, instanceTypes)));
    const ids = (res.Instances ?? []).flatMap((i) => i.InstanceIds ?? []);
    for (const e of res.Errors ?? []) {
      logger.warn(
        `[orchestrator] fleet(${label}) pool error: ${e.ErrorCode ?? "?"} ${e.ErrorMessage ?? ""}`.trim()
      );
    }
    return ids;
  } catch (err) {
    logger.error(`[orchestrator] CreateFleet(${label}) threw: ${(err as Error).message}`);
    return [];
  }
};

/**
 * Launch up to N workers with a STRICT instance-type preference order. The first
 * entry of WORKER_INSTANCE_TYPES (c7g.xlarge) is the preferred type and is tried
 * ALONE first, across all AZs (capacity-optimized = deepest AZ Spot pool). Only the
 * capacity the preferred type could NOT supply this minute spills to the remaining
 * (fallback) types, again across all AZs. So a fallback type is used ONLY when the
 * preferred type is unavailable in every AZ -- never while c7g.xlarge has room.
 *
 * "Is c7g.xlarge available?" is answered by EC2 itself: tier 1 attempts it and
 * returns the instances EC2 launched; an empty tier-1 result (with ICE/
 * UnfulfillableCapacity in the logs) means c7g.xlarge is unavailable right now.
 *
 * Spot-ONLY by policy: if neither the preferred nor fallback Spot pools have
 * capacity, we launch nothing and the backlog stays queued (the cron retries every
 * minute). ONDEMAND_FALLBACK (default off) can opt in to covering the remainder
 * On-Demand. Instances are tagged here so the per-env `role` tag is authoritative
 * for countRunningWorkers even if a launch template omits it.
 */
export const launchWorkers = async (n: number): Promise<string[]> => {
  const [preferred, ...fallbacks] = config.WORKER_INSTANCE_TYPES;
  const ids: string[] = [];

  // Tier 1 -- preferred type only (e.g. c7g.xlarge), across all AZs.
  if (preferred) ids.push(...(await createFleet(n, true, [preferred], `spot:${preferred}`)));

  // Tier 2 -- fallback types, ONLY for capacity the preferred type couldn't give.
  if (ids.length < n && fallbacks.length > 0) {
    const shortfall = n - ids.length;
    logger.warn(
      `[orchestrator] ${preferred} gave ${ids.length}/${n} (unavailable in all AZs); ` +
        `falling back to ${fallbacks.join(",")} for ${shortfall}`
    );
    ids.push(...(await createFleet(shortfall, true, fallbacks, "spot:fallback")));
  }

  // On-Demand -- OFF by default (Spot-only policy); covers any remaining shortfall.
  if (ids.length < n && config.ONDEMAND_FALLBACK) {
    const shortfall = n - ids.length;
    logger.warn(`[orchestrator] Spot gave ${ids.length}/${n}; On-Demand fallback for ${shortfall}`);
    ids.push(...(await createFleet(shortfall, false, config.WORKER_INSTANCE_TYPES, "on-demand")));
  }

  if (ids.length > 0) {
    await ec2.send(
      new CreateTagsCommand({
        Resources: ids,
        Tags: [{ Key: "role", Value: config.WORKER_ROLE_TAG }],
      })
    );
  }
  logger.info(`[orchestrator] launched ${ids.length}/${n} worker(s): ${ids.join(", ")}`);
  return ids;
};
