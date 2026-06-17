import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost, type PresignedPost } from "@aws-sdk/s3-presigned-post";
import config from "../config";

/**
 * Raw upload storage = AWS S3 in the same region as the workers (free egress on
 * download). Presigned POST so S3 enforces size + content-type at upload time;
 * HeadObject so /complete never trusts the client's "done".
 */
class S3UploadService {
  private client = new S3Client({
    region: config.AWS_REGION,
    credentials:
      config.AWS_S3_ACCESS_KEY && config.AWS_S3_SECRET_KEY
        ? { accessKeyId: config.AWS_S3_ACCESS_KEY, secretAccessKey: config.AWS_S3_SECRET_KEY }
        : undefined, // fall back to the instance/role credential chain
    // Local testing: point at MinIO/LocalStack. No-op in prod (S3_ENDPOINT empty).
    ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
  });

  async createPresignedUpload(key: string, maxBytes: number): Promise<PresignedPost> {
    return createPresignedPost(this.client, {
      Bucket: config.UPLOAD_BUCKET,
      Key: key,
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["starts-with", "$Content-Type", "video/"],
      ],
      Expires: 3600,
    });
  }

  /** Returns the verified byte size, or null if the object is absent. */
  async getUploadedSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: config.UPLOAD_BUCKET, Key: key })
      );
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  /** Worker: stream the original from S3 to a local file (same-region = free egress). */
  async downloadToFile(key: string, destPath: string): Promise<void> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: config.UPLOAD_BUCKET, Key: key })
    );
    if (!out.Body) throw new Error(`S3 object ${key} has no body`);
    await pipeline(out.Body as Readable, createWriteStream(destPath));
  }
}

export default new S3UploadService();
