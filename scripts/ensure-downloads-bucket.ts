/* eslint-disable no-console -- one-off CLI script; prints status to the terminal. */
/**
 * One-off, idempotent: create the single PRIVATE R2 bucket that holds the
 * processed downloadable MP4s (R2_DOWNLOADS_BUCKET). Reuses the R2 account +
 * credentials already in .env via `config`; no secrets live in this file.
 *
 * Run: `npx tsx scripts/ensure-downloads-bucket.ts`
 *
 * Safe to run repeatedly: an existing bucket you own is treated as success. Do
 * NOT attach a public domain / r2.dev binding to this bucket: objects are served
 * only through short-lived presigned GET URLs.
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import config from "../src/config";
import { R2_DOWNLOADS_BUCKET } from "../src/utils/const";

const r2 = new S3Client({
  region: "auto",
  endpoint: config.R2_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials:
    config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
      ? { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
      : undefined,
});

async function main(): Promise<void> {
  if (!config.R2_ENDPOINT || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 config (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) in .env");
  }

  // Already exists and we own it -> nothing to do.
  try {
    await r2.send(new HeadBucketCommand({ Bucket: R2_DOWNLOADS_BUCKET }));
    console.log(`[ensure-downloads-bucket] "${R2_DOWNLOADS_BUCKET}" already exists; nothing to do.`);
    return;
  } catch {
    // fall through to create
  }

  try {
    await r2.send(new CreateBucketCommand({ Bucket: R2_DOWNLOADS_BUCKET }));
    console.log(`[ensure-downloads-bucket] created private bucket "${R2_DOWNLOADS_BUCKET}".`);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") {
      console.log(`[ensure-downloads-bucket] "${R2_DOWNLOADS_BUCKET}" already exists; nothing to do.`);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(`[ensure-downloads-bucket] FAILED: ${(err as Error).message}`);
  process.exit(1);
});
