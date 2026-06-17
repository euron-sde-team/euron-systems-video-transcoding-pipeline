import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
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
 * Launch N Spot workers from the Launch Template. shutdown-behavior=terminate is
 * what lets a worker end itself with `shutdown -h now`. The template can carry
 * AMI / IAM profile / security groups; we override the cost-sensitive knobs here.
 */
export const launchWorkers = async (n: number): Promise<string[]> => {
  const res = await ec2.send(
    new RunInstancesCommand({
      LaunchTemplate: {
        LaunchTemplateName: config.LAUNCH_TEMPLATE_NAME,
        Version: config.LAUNCH_TEMPLATE_VERSION,
      },
      MinCount: n,
      MaxCount: n,
      InstanceInitiatedShutdownBehavior: "terminate",
      InstanceMarketOptions: { MarketType: "spot" },
      ...(config.WORKER_INSTANCE_TYPE
        ? { InstanceType: config.WORKER_INSTANCE_TYPE as _InstanceType }
        : {}),
      ...(config.WORKER_SUBNET_ID ? { SubnetId: config.WORKER_SUBNET_ID } : {}),
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [{ Key: "role", Value: config.WORKER_ROLE_TAG }],
        },
      ],
    })
  );
  const ids = (res.Instances ?? [])
    .map((i) => i.InstanceId)
    .filter((id): id is string => Boolean(id));
  logger.info(`[orchestrator] launched ${ids.length} worker(s): ${ids.join(", ")}`);
  return ids;
};
