// PORTED: the SaaS presign + HeadObject now live in euron-systems-tenant-admin-
// backend/src/services/vod-s3.service.ts. Kept here for reference / standalone
// operator use (deprecate-don't-delete).
import { createReadStream, createWriteStream } from "fs";
import { stat } from "fs/promises";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost, type PresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  /** Abortable: `signal` cancels both the S3 request and the local stream pipe,
   *  so a worker that loses its claim mid-download stops pulling bytes at once. */
  async downloadToFile(key: string, destPath: string, signal?: AbortSignal): Promise<void> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: config.UPLOAD_BUCKET, Key: key }),
      { abortSignal: signal }
    );
    if (!out.Body) throw new Error(`S3 object ${key} has no body`);
    await pipeline(out.Body as Readable, createWriteStream(destPath), { signal });
  }

  /**
   * NOT IN USE (processed download moved to R2): the processed downloadable MP4 now
   * goes to the private R2 downloads bucket (uploadProcessedDownload in worker/r2.ts)
   * for free egress. Retained per deprecate-don't-delete; no caller remains.
   *
   * Worker: upload a local file into the (private) upload bucket.
   */
  async uploadFile(key: string, filePath: string, contentType: string): Promise<void> {
    const size = (await stat(filePath)).size;
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.UPLOAD_BUCKET,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
      })
    );
  }

  /**
   * NOT IN USE (processed download moved to R2): the processed-download presign now
   * lives in r2-read.service.ts (getProcessedDownloadUrl). Retained per
   * deprecate-don't-delete; no caller remains.
   *
   * API: mint a short-lived presigned GET URL for a private upload-bucket object,
   * or null if it does not exist. `downloadName` sets a friendly Content-Disposition
   * filename for the browser's "Save as".
   */
  async getPresignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    downloadName?: string
  ): Promise<string | null> {
    if ((await this.getUploadedSize(key)) === null) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: config.UPLOAD_BUCKET,
        Key: key,
        ...(downloadName
          ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` }
          : {}),
      }),
      { expiresIn: ttlSeconds }
    );
  }
}

export default new S3UploadService();
