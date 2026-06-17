import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV ?? "development";

/**
 * Centralized env config for all three runtimes (API, worker, orchestrator).
 * Each runtime reads only the slice it needs; unset values fall back to safe
 * dev defaults so the service boots before the developer wires real creds.
 */
const config = {
  NODE_ENV,
  isProduction: NODE_ENV === "production",
  PORT: process.env.PORT ?? "4020",

  // ─── Postgres (dedicated DB) ───────────────────────────────────────────────
  PG_DATABASE_HOST: process.env.PG_DATABASE_HOST ?? "localhost",
  PG_DATABASE_USER: process.env.PG_DATABASE_USER ?? "postgres",
  PG_DATABASE_PASSWORD: process.env.PG_DATABASE_PASSWORD ?? "postgres",
  PG_DATABASE_PORT: process.env.PG_DATABASE_PORT ?? "5432",
  PG_DATABASE: process.env.PG_DATABASE ?? "euron_video_pipeline",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PG_POOL_MAX: process.env.PG_POOL_MAX,
  PG_POOL_MIN: process.env.PG_POOL_MIN,
  PG_CONNECTION_TIMEOUT: process.env.PG_CONNECTION_TIMEOUT,
  PG_IDLE_TIMEOUT: process.env.PG_IDLE_TIMEOUT,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  // Service-to-service shared secret for the management API.
  SERVICE_API_KEY: process.env.SERVICE_API_KEY ?? "change-me-service-key",
  // Public base URL of THIS service's API (e.g. https://video.euron.one). Used
  // only to bake the native-HLS key URI into manifests; leave blank to omit it
  // (the Shaka/MSE clearKeys path doesn't need it).
  PUBLIC_API_BASE: process.env.PUBLIC_API_BASE ?? "",

  // HS256 secret for short-TTL playback tokens (the actual security boundary).
  PLAYBACK_TOKEN_SECRET: process.env.PLAYBACK_TOKEN_SECRET ?? "change-me-playback-secret",
  // Default TTL for minted playback tokens. The platform can mint shorter ones
  // for key-only fetches; clamped to [10, PLAYBACK_TOKEN_MAX_TTL_SECONDS] at mint.
  PLAYBACK_TOKEN_TTL_SECONDS: Number(process.env.PLAYBACK_TOKEN_TTL_SECONDS ?? "300"),
  PLAYBACK_TOKEN_MAX_TTL_SECONDS: Number(process.env.PLAYBACK_TOKEN_MAX_TTL_SECONDS ?? "3600"),

  // ─── AWS (S3 uploads, KMS key wrapping, EC2 orchestration) ─────────────────
  AWS_REGION: process.env.AWS_REGION ?? "ap-south-1",
  AWS_S3_ACCESS_KEY: process.env.AWS_S3_ACCESS_KEY ?? "",
  AWS_S3_SECRET_KEY: process.env.AWS_S3_SECRET_KEY ?? "",
  UPLOAD_BUCKET: process.env.UPLOAD_BUCKET ?? "euron-uploads",
  // Custom S3 endpoint for raw uploads. Empty = real AWS S3 (prod). Set to a
  // MinIO/LocalStack URL for fully-local testing; forces path-style addressing.
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_BYTES ?? String(20 * 1024 ** 3)),
  MAX_IN_FLIGHT: Number(process.env.MAX_IN_FLIGHT ?? "50"),
  KEY_KMS_KEY_ID: process.env.KEY_KMS_KEY_ID ?? "",

  // ─── Cloudflare R2 (processed output) ──────────────────────────────────────
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "euron-vod",
  R2_ENDPOINT:
    process.env.R2_ENDPOINT ??
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : ""),
  R2_PUBLIC_BASE: process.env.R2_PUBLIC_BASE ?? "",

  // ─── Orchestrator (Lambda) ─────────────────────────────────────────────────
  MAX_WORKERS: Number(process.env.MAX_WORKERS ?? "20"),
  DIVISOR: Number(process.env.DIVISOR ?? "2"),
  LAUNCH_TEMPLATE_NAME: process.env.LAUNCH_TEMPLATE_NAME ?? "transcoder",
  LAUNCH_TEMPLATE_VERSION: process.env.LAUNCH_TEMPLATE_VERSION ?? "$Latest",
  WORKER_INSTANCE_TYPE: process.env.WORKER_INSTANCE_TYPE ?? "c7g.xlarge",
  WORKER_SUBNET_ID: process.env.WORKER_SUBNET_ID ?? "",
  WORKER_ROLE_TAG: process.env.WORKER_ROLE_TAG ?? "transcoder",

  // ─── Worker (EC2) ──────────────────────────────────────────────────────────
  WORKER_ID: process.env.WORKER_ID ?? "",
  IDLE_GRACE_MS: Number(process.env.IDLE_GRACE_MS ?? "120000"),
  POLL_MS: Number(process.env.POLL_MS ?? "5000"),
  HEARTBEAT_MS: Number(process.env.HEARTBEAT_MS ?? "30000"),
  WHISPER_BIN: process.env.WHISPER_BIN ?? "/opt/whisper.cpp/main",
  WHISPER_MODEL: process.env.WHISPER_MODEL ?? "/opt/models/ggml-small.bin",
  FFMPEG_BIN: process.env.FFMPEG_BIN ?? "ffmpeg",
  FFPROBE_BIN: process.env.FFPROBE_BIN ?? "ffprobe",
  SHAKA_PACKAGER_BIN: process.env.SHAKA_PACKAGER_BIN ?? "packager",
  WORK_DIR: process.env.WORK_DIR ?? "/tmp/euron-vod",
  WORKER_DRY_RUN_SHUTDOWN: (process.env.WORKER_DRY_RUN_SHUTDOWN ?? "true") !== "false",
};

export default config;
