import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import config from "../config";

// API-side R2 reader (R2 is S3-compatible). The worker writes the output tree;
// the API reads back the small AES-128 HLS manifests to rewrite them per request.
const r2 = new S3Client({
  region: "auto",
  endpoint: config.R2_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials:
    config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
      ? { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
      : undefined,
});

/** Read a small text object (a manifest) from R2; null if the key is absent. */
export const getObjectText = async (key: string): Promise<string | null> => {
  try {
    const out = await r2.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
    if (!out.Body) return null;
    return await out.Body.transformToString();
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
};

/**
 * Sum the sizes of every object under an R2 key prefix (a video's output tree),
 * the LIVE footprint as it actually sits in the output bucket. Paginates
 * ListObjectsV2 (1000/page). Returns 0 for an empty/absent prefix.
 *
 * This is the authoritative read for "space used in R2", it works for legacy
 * videos that predate the cached output_bytes column. Output is immutable once a
 * video is ready, so callers should cache the result rather than re-list often.
 */
export const sumPrefixBytes = async (prefix: string): Promise<number> => {
  const normalized = prefix.replace(/\/+$/, "") + "/";
  let total = 0;
  let token: string | undefined;
  do {
    const out = await r2.send(
      new ListObjectsV2Command({
        Bucket: config.R2_BUCKET,
        Prefix: normalized,
        ContinuationToken: token,
      })
    );
    for (const obj of out.Contents ?? []) total += obj.Size ?? 0;
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return total;
};
