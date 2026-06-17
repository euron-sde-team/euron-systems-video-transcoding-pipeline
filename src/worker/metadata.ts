import config from "../config";
import logger from "../utils/logger";

const IMDS = "http://169.254.169.254";

const fetchWithTimeout = async (
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 1000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
};

/** IMDSv2 session token (preferred). Returns "" on failure (falls back to v1). */
const imdsToken = async (): Promise<string> => {
  try {
    const res = await fetchWithTimeout(`${IMDS}/latest/api/token`, {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "120" },
    });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
};

const getMetadata = async (path: string): Promise<{ status: number; body: string } | null> => {
  try {
    const token = await imdsToken();
    const headers: Record<string, string> = token ? { "X-aws-ec2-metadata-token": token } : {};
    const res = await fetchWithTimeout(`${IMDS}/latest/meta-data/${path}`, { headers });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch {
    return null;
  }
};

/** Worker id = EC2 instance id (constraint #5 counts workers from EC2, not DB). */
export const getInstanceId = async (): Promise<string> => {
  if (config.WORKER_ID) return config.WORKER_ID;
  const meta = await getMetadata("instance-id");
  if (meta?.status === 200 && meta.body) return meta.body.trim();
  // Local dev fallback, stable per process.
  return `local-${process.pid}`;
};

/**
 * Spot interruption check. The action endpoint returns 404 normally and 200
 * with a JSON {action, time} once a ~2-minute interruption notice is issued.
 */
export const checkSpotInterruption = async (): Promise<boolean> => {
  const meta = await getMetadata("spot/instance-action");
  if (!meta) return false;
  return meta.status === 200;
};

export const logMetadataMode = (instanceId: string): void => {
  logger.info(
    instanceId.startsWith("local-")
      ? `[worker] running OUTSIDE EC2 (id=${instanceId}); IMDS unavailable, self-terminate is dry-run`
      : `[worker] EC2 instance ${instanceId}`
  );
};
