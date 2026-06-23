import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
