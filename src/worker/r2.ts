import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import path from "path";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import config from "../config";
import { OwnershipLostError } from "../encoding/exec";
import { R2_DOWNLOADS_BUCKET } from "../utils/const";
import logger from "../utils/logger";

// R2 is S3-compatible: region "auto", custom endpoint, R2 creds. Path-style
// addressing works for both R2 and a local MinIO endpoint.
const r2 = new S3Client({
  region: "auto",
  endpoint: config.R2_ENDPOINT || undefined,
  forcePathStyle: true,
  // A large output tree is thousands of PutObjects over the billed EC2->R2 egress hop.
  // R2/Cloudflare can return a transient 5xx or throttle mid-upload; with the SDK
  // default (3 attempts, no backoff) one such blip sinks the whole tree and the video
  // restarts from zero. Adaptive retry adds a client-side rate limiter + backoff, and
  // explicit timeouts turn a hung socket into a retryable error instead of a stall
  // (requestTimeout is generous so a legit multi-GB download-MP4 PUT is never cut off).
  // Per-file retry with a FRESH stream lives in withRetry() below, because the SDK
  // cannot rewind a consumed read stream to replay a stream-body PUT.
  maxAttempts: 5,
  retryMode: "adaptive",
  requestHandler: { connectionTimeout: 6_000, requestTimeout: 300_000 },
  credentials:
    config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
      ? { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
      : undefined,
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an idempotent R2 PUT with exponential backoff + jitter. `fn` is invoked
 * fresh on every attempt so the caller can re-create the read stream (a consumed
 * stream cannot be replayed). A lost-claim abort (OwnershipLostError / aborted
 * signal) is NEVER retried, it surfaces immediately so a reaped/cancelled video
 * stops shipping bytes. This sits ON TOP of the client's adaptive retry: the SDK
 * handles what it can replay, this covers the stream-body PUTs it cannot.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  signal?: AbortSignal,
  attempts = 5,
  baseMs = 500
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new OwnershipLostError(label);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof OwnershipLostError || signal?.aborted) throw err;
      lastErr = err;
      if (attempt === attempts) break;
      const backoff = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      logger.warn(
        `[r2] ${label} attempt ${attempt}/${attempts} failed: ${(err as Error).message}; retry in ${backoff}ms`
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

const contentTypeFor = (file: string): string => {
  if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  // NOT IN USE (HLS-only migration): .mpd (DASH) and .m4s (cbcs CMAF) are no longer
  // produced; kept so any stray such file still receives a correct content type.
  if (file.endsWith(".mpd")) return "application/dash+xml";
  if (file.endsWith(".m4s")) return "video/iso.segment";
  if (file.endsWith(".ts")) return "video/mp2t"; // AES-128 HLS-TS segments (active path)
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".vtt")) return "text/vtt";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

// Manifests get a short TTL (so a re-publish propagates); everything else is
// content-addressed-immutable for the life of the video.
const cacheControlFor = (file: string): string =>
  // NOT IN USE part: ".mpd" (DASH) is no longer produced; the ".m3u8" check is what
  // matters now (AES HLS manifests get the short TTL; segments stay immutable).
  file.endsWith(".m3u8") || file.endsWith(".mpd")
    ? "public, max-age=300"
    : "public, max-age=31536000, immutable";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    // Defensive: never ship a raw AES key file even if one lands under outputDir.
    // (The HLS-AES key file lives in the temp renditions dir, not here, but this
    // guarantees a content key can never leak to the public CDN.)
    else if (!entry.name.endsWith(".key")) out.push(full);
  }
  return out;
}

/** Bounded-concurrency map (no extra dep). */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx] as T);
    }
  });
  await Promise.all(workers);
}

/** Result of an output-tree upload: how many files and how many total bytes landed in R2. */
export interface UploadOutputResult {
  fileCount: number;
  /** Total size of the packaged output tree in the R2 output bucket. */
  bytes: number;
}

/**
 * Upload the entire packaged output tree to R2 under `{outputPrefix}/...`.
 * EC2→R2 is the billed egress hop (constraint #11), so this is the only place
 * bytes leave AWS, keep the ladder disciplined upstream, not here.
 *
 * Returns the byte total (already summed here for logging) so the caller can
 * persist it as the video's output-bucket footprint, no R2 LIST needed later.
 */
export const uploadOutputTree = async (
  outputDir: string,
  outputPrefix: string,
  signal?: AbortSignal
): Promise<UploadOutputResult> => {
  const files = await walk(outputDir);
  let bytes = 0;

  await mapPool(files, 8, async (filePath) => {
    // Per-file abort check: a claim lost mid-upload stops within one file (a few
    // MB segment) instead of shipping the rest of a multi-GB tree to R2.
    if (signal?.aborted) throw new OwnershipLostError("upload-output");
    const rel = path.relative(outputDir, filePath).split(path.sep).join("/");
    const key = `${outputPrefix}/${rel}`;
    const size = (await stat(filePath)).size;
    bytes += size;
    await withRetry(
      () =>
        r2.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: key,
            Body: createReadStream(filePath), // fresh stream per attempt (see withRetry)
            ContentLength: size,
            ContentType: contentTypeFor(filePath),
            CacheControl: cacheControlFor(filePath),
          }),
          { abortSignal: signal }
        ),
      `put ${rel}`,
      signal
    );
  });

  logger.info(`[r2] uploaded ${files.length} files (${bytes} bytes) → ${outputPrefix}/`);
  return { fileCount: files.length, bytes };
};

/**
 * Upload the processed downloadable MP4 (the unencrypted master) into the PRIVATE
 * R2 downloads bucket. Kept OUT of the public output bucket / CDN: this is the
 * full unencrypted video, served only via a short-lived presigned GET. No public
 * cache headers (the object is private).
 */
export const uploadProcessedDownload = async (
  key: string,
  filePath: string,
  signal?: AbortSignal
): Promise<void> => {
  const size = (await stat(filePath)).size;
  await withRetry(
    () =>
      r2.send(
        new PutObjectCommand({
          Bucket: R2_DOWNLOADS_BUCKET,
          Key: key,
          Body: createReadStream(filePath), // fresh stream per attempt (see withRetry)
          ContentLength: size,
          ContentType: "video/mp4",
        }),
        { abortSignal: signal }
      ),
    `put-download ${key}`,
    signal
  );
  logger.info(`[r2] uploaded processed download (${size} bytes) → ${R2_DOWNLOADS_BUCKET}/${key}`);
};

/**
 * Delete every object under `{outputPrefix}/` in the public output bucket PLUS the
 * processed-download MP4 in the private downloads bucket. Cleanup path for
 * CANCELLED videos only (terminal state; nothing re-reads these objects, and a
 * cancelled row can never be re-enqueued). Idempotent: an already-empty prefix is
 * a no-op LIST and deleting a missing key is a success in S3/R2. The trailing
 * slash on the prefix scopes the LIST to exactly one video's tree.
 * Returns how many output-bucket objects were deleted.
 */
export const deleteVideoArtifacts = async (
  outputPrefix: string,
  downloadKey: string
): Promise<number> => {
  let deleted = 0;
  let token: string | undefined;
  do {
    const listed = await r2.send(
      new ListObjectsV2Command({
        Bucket: config.R2_BUCKET,
        Prefix: `${outputPrefix}/`,
        ContinuationToken: token,
      })
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k);
    if (keys.length > 0) {
      // DeleteObjects caps at 1000 keys; ListObjectsV2 pages are <=1000, so one
      // delete per page is always within the limit.
      const res = await r2.send(
        new DeleteObjectsCommand({
          Bucket: config.R2_BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      );
      // Quiet mode still reports per-key failures; surface them so the caller's
      // per-video catch logs it and the next in-window sweep retries.
      if (res.Errors && res.Errors.length > 0) {
        throw new Error(
          `DeleteObjects failed for ${res.Errors.length}/${keys.length} key(s), first: ${res.Errors[0]?.Key} (${res.Errors[0]?.Message})`
        );
      }
      deleted += keys.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);

  await r2.send(
    new DeleteObjectCommand({ Bucket: R2_DOWNLOADS_BUCKET, Key: downloadKey })
  );

  if (deleted > 0) {
    logger.info(`[r2] deleted ${deleted} object(s) under ${outputPrefix}/ (cancelled video)`);
  }
  return deleted;
};
