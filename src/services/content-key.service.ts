// PORTED: the delivery half (unwrap) now also lives in euron-systems-user-server/
// src/services/content-key.service.ts. The worker still generates + wraps keys
// here. Kept for reference / standalone operator use (deprecate-don't-delete).
import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import config from "../config";
import { InternalServerError } from "../errors/internal-server.error";
import videoKeysRepository from "../repositories/video-keys.repository";

type WrapScheme = "kms" | "local_aes";

export interface GeneratedKey {
  kidHex: string; // 32 hex chars (16-byte key id)
  keyHex: string; // 32 hex chars (16-byte AES-128 content key)
  keyBytes: Buffer;
}

export interface DeliveredKey {
  kidHex: string;
  keyHex: string;
  keyBytes: Buffer;
}

/**
 * Per-video cbcs clear-key lifecycle: generate (worker, packaging stage), wrap
 * at rest, unwrap on delivery (key endpoint). KMS in prod; local AES-256-GCM in
 * dev so the pipeline runs without AWS. The wrapped form is what lives in the DB.
 */
class ContentKeyService {
  private kms: KMSClient | null = config.KEY_KMS_KEY_ID
    ? new KMSClient({
        region: config.AWS_REGION,
        credentials:
          config.AWS_S3_ACCESS_KEY && config.AWS_S3_SECRET_KEY
            ? { accessKeyId: config.AWS_S3_ACCESS_KEY, secretAccessKey: config.AWS_S3_SECRET_KEY }
            : undefined,
      })
    : null;

  /** 16-byte kid + 16-byte AES-128 key. */
  generate(): GeneratedKey {
    const key = randomBytes(16);
    return {
      kidHex: randomBytes(16).toString("hex"),
      keyHex: key.toString("hex"),
      keyBytes: key,
    };
  }

  // Dev-only symmetric wrap key, domain-separated from the playback secret.
  private localWrapKey(): Buffer {
    return createHash("sha256")
      .update(`euron-vod-key-wrap:${config.PLAYBACK_TOKEN_SECRET}`)
      .digest();
  }

  async wrap(keyBytes: Buffer): Promise<{ wrappedKey: string; scheme: WrapScheme }> {
    if (this.kms && config.KEY_KMS_KEY_ID) {
      const out = await this.kms.send(
        new EncryptCommand({ KeyId: config.KEY_KMS_KEY_ID, Plaintext: keyBytes })
      );
      if (!out.CiphertextBlob) throw new InternalServerError("KMS returned no ciphertext");
      return { wrappedKey: Buffer.from(out.CiphertextBlob).toString("base64"), scheme: "kms" };
    }
    // local AES-256-GCM: base64( iv(12) || tag(16) || ciphertext )
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.localWrapKey(), iv);
    const ct = Buffer.concat([cipher.update(keyBytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { wrappedKey: Buffer.concat([iv, tag, ct]).toString("base64"), scheme: "local_aes" };
  }

  async unwrap(wrappedKey: string, scheme: WrapScheme): Promise<Buffer> {
    if (scheme === "kms") {
      if (!this.kms) throw new InternalServerError("KMS not configured but key is KMS-wrapped");
      const out = await this.kms.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(wrappedKey, "base64"),
          KeyId: config.KEY_KMS_KEY_ID || undefined,
        })
      );
      if (!out.Plaintext) throw new InternalServerError("KMS returned no plaintext");
      return Buffer.from(out.Plaintext);
    }
    const raw = Buffer.from(wrappedKey, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.localWrapKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  /** Worker: generate, wrap, persist. Returns the RAW kid/key hex for the packager. */
  async generateAndStore(tenantId: string, videoId: string): Promise<GeneratedKey> {
    const gen = this.generate();
    const { wrappedKey, scheme } = await this.wrap(gen.keyBytes);
    await videoKeysRepository.upsert({
      videoId,
      tenantId,
      kidHex: gen.kidHex,
      wrappedKey,
      wrapScheme: scheme,
    });
    return gen;
  }

  /** Key endpoint: fetch + unwrap. Null when the video has no key yet. */
  async getForPlayback(tenantId: string, videoId: string): Promise<DeliveredKey | null> {
    const row = await videoKeysRepository.findByVideoId(videoId, tenantId);
    if (!row) return null;
    const keyBytes = await this.unwrap(row.wrapped_key, row.wrap_scheme as WrapScheme);
    return { kidHex: row.kid_hex, keyBytes, keyHex: keyBytes.toString("hex") };
  }
}

export default new ContentKeyService();
