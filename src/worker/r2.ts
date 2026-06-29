import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import config from "../config";
import { R2_DOWNLOADS_BUCKET } from "../utils/const";
import logger from "../utils/logger";

// R2 is S3-compatible: region "auto", custom endpoint, R2 creds. Path-style
// addressing works for both R2 and a local MinIO endpoint.
const r2 = new S3Client({
  region: "auto",
  endpoint: config.R2_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials:
    config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
      ? { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
      : undefined,
});

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
  outputPrefix: string
): Promise<UploadOutputResult> => {
  const files = await walk(outputDir);
  let bytes = 0;

  await mapPool(files, 8, async (filePath) => {
    const rel = path.relative(outputDir, filePath).split(path.sep).join("/");
    const key = `${outputPrefix}/${rel}`;
    const size = (await stat(filePath)).size;
    bytes += size;
    await r2.send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentTypeFor(filePath),
        CacheControl: cacheControlFor(filePath),
      })
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
export const uploadProcessedDownload = async (key: string, filePath: string): Promise<void> => {
  const size = (await stat(filePath)).size;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_DOWNLOADS_BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
      ContentType: "video/mp4",
    })
  );
  logger.info(`[r2] uploaded processed download (${size} bytes) → ${R2_DOWNLOADS_BUCKET}/${key}`);
};
