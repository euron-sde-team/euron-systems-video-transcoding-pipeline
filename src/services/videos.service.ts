import { randomUUID } from "crypto";
import type { PresignedPost } from "@aws-sdk/s3-presigned-post";
import config from "../config";
import { video_status } from "../db/enums";
import { BadRequestError } from "../errors/bad-request.error";
import { ConflictError } from "../errors/conflict.error";
import { NotFoundError } from "../errors/not-found.error";
import { TooManyRequestError } from "../errors/too-many-request.error";
import { UnprocessableError } from "../errors/unprocessable.error";
import videosRepository, { type VideoRow } from "../repositories/videos.repository";
import { ALLOWED_UPLOAD_EXT, OUTPUT_FILES, processedDownloadKey } from "../utils/const";
import playbackTokenService from "./playback-token.service";
import { sumPrefixBytes } from "./r2-read.service";
import s3UploadService from "./s3-upload.service";

/** Max ids accepted per batch storage request (bounds the fan-out of R2 LISTs). */
const MAX_STORAGE_BATCH = 100;

/** Bounded-concurrency map that collects results in input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface VideoResponse {
  id: string;
  tenantId: string;
  /** Operator-set title (stored in pipeline_config). Null when never set. */
  title: string | null;
  /** Always-present label for UI: the title, else a short id fallback. */
  displayName: string;
  status: string;
  stage: string | null;
  progress: number;
  orientation: string | null;
  protection: string;
  watermark: string;
  allowOffline: boolean;
  captionsLangs: string[];
  sourceBytes: number | null;
  /** R2 output-bucket key prefix for this video's assets ({tenant_id}/{id}). */
  outputPrefix: string;
  /** Total bytes this video's assets occupy in the R2 output bucket; null until ready. */
  outputBytes: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  /** API-relative link to the processed downloadable MP4 (present when ready). */
  download?: string | null;
  /** Present only when status='ready'. Absolute CDN URLs (except API-relative keyEndpoint/hlsAes). */
  playback?: {
    hls: string;
    dash: string;
    /** AES-128 HLS-TS master for the native-Safari path; API-relative, served + rewritten per request. */
    hlsAes: string;
    poster: string;
    thumbnailsVtt: string;
    keyEndpoint: string;
  } | null;
}

const toIso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : v ? String(v) : "";

const parseBigInt = (v: unknown): number | null =>
  v === null || v === undefined ? null : typeof v === "string" ? parseInt(v, 10) : Number(v);

function cdnUrl(outputPrefix: string, file: string): string {
  const base = config.R2_PUBLIC_BASE.replace(/\/+$/, "");
  return `${base}/${outputPrefix}/${file}`;
}

function toVideoResponse(row: VideoRow): VideoResponse {
  const isReady = row.status === video_status.ready;
  const prefix = row.output_prefix ?? `${row.tenant_id}/${row.id}`;
  const pc = (row.pipeline_config ?? {}) as { title?: string };
  const title = typeof pc.title === "string" && pc.title.trim() ? pc.title.trim() : null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title,
    displayName: title ?? `Video ${row.id.slice(0, 8)}`,
    status: row.status,
    stage: row.stage ?? null,
    progress: row.progress,
    orientation: row.orientation ?? null,
    protection: row.protection,
    watermark: row.watermark,
    allowOffline: Boolean(row.allow_offline),
    captionsLangs: row.captions_langs ?? [],
    sourceBytes: parseBigInt(row.source_bytes),
    outputPrefix: prefix,
    outputBytes: parseBigInt(row.output_bytes),
    error: row.error ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    readyAt: row.ready_at ? toIso(row.ready_at) : null,
    download: isReady ? `/videos/${row.id}/download` : null,
    playback:
      isReady && config.R2_PUBLIC_BASE
        ? {
            hls: cdnUrl(prefix, OUTPUT_FILES.hlsMaster),
            dash: cdnUrl(prefix, OUTPUT_FILES.dashManifest),
            hlsAes: `/videos/${row.id}/hls/master.m3u8`,
            poster: cdnUrl(prefix, OUTPUT_FILES.poster),
            thumbnailsVtt: cdnUrl(prefix, OUTPUT_FILES.thumbnailsVtt),
            keyEndpoint: `/videos/${row.id}/key`,
          }
        : null,
  };
}

class VideosService {
  /** POST /videos/uploads, validate + cap + create row + presigned POST. */
  async createUpload(
    tenantId: string,
    filename: string,
    title?: string
  ): Promise<{ videoId: string; upload: PresignedPost }> {
    const ext = String(filename ?? "").split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_UPLOAD_EXT.has(ext)) {
      throw new UnprocessableError("Unsupported file type");
    }

    const inFlight = await videosRepository.countInFlight(tenantId);
    if (inFlight >= config.MAX_IN_FLIGHT) {
      throw new TooManyRequestError("Too many videos in flight");
    }

    // Generate the id up front so the S3 key embeds it (key = prefix/original.ext).
    const videoId = randomUUID();
    const sourceKey = `${tenantId}/${videoId}/original.${ext}`;
    const outputPrefix = `${tenantId}/${videoId}`;

    // Default the title to the original filename so the dashboard never shows a bare id.
    const resolvedTitle = title?.trim() || filename.trim();

    // create() generates its own id; align the row id with the key's id.
    const row = await videosRepository.create({
      tenantId,
      sourceKey,
      outputPrefix,
      title: resolvedTitle || undefined,
    });

    const upload = await s3UploadService.createPresignedUpload(
      row.source_key as string,
      config.MAX_UPLOAD_BYTES
    );
    return { videoId: row.id, upload };
  }

  /** POST /videos/:id/complete, HeadObject verify, then enqueue (uploading → uploaded). */
  async completeUpload(tenantId: string, id: string): Promise<{ videoId: string; status: string }> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    if (video.status !== video_status.uploading) {
      throw new ConflictError(`Cannot complete from ${video.status}`);
    }
    if (!video.source_key) throw new BadRequestError("Video has no source key");

    const size = await s3UploadService.getUploadedSize(video.source_key);
    if (size === null) throw new UnprocessableError("Upload not found in storage");

    await videosRepository.markUploaded(id, tenantId, size);
    return { videoId: id, status: video_status.uploaded };
  }

  async getVideo(tenantId: string, id: string): Promise<VideoResponse> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    return toVideoResponse(video);
  }

  /**
   * LIVE per-video R2 footprint for a batch of videos (the dashboard's visible
   * cards). Resolves each id's output_prefix (tenant-scoped) then sums the R2
   * objects under it via batched ListObjectsV2. Authoritative (works for legacy
   * videos with no output_bytes), at the cost of R2 LIST calls, so the frontend
   * caches the result (output is immutable once ready). Unknown ids are dropped.
   */
  async getR2StorageForVideos(
    tenantId: string,
    ids: string[]
  ): Promise<{ items: { id: string; bytes: number }[]; total: number }> {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_STORAGE_BATCH);
    if (unique.length === 0) return { items: [], total: 0 };

    const rows = await videosRepository.findByIdsForTenant(unique, tenantId);
    const items = await mapPool(rows, 8, async (row) => {
      const prefix = row.output_prefix ?? `${tenantId}/${row.id}`;
      const bytes = await sumPrefixBytes(prefix);
      return { id: row.id, bytes };
    });
    const total = items.reduce((sum, it) => sum + it.bytes, 0);
    return { items, total };
  }

  /**
   * Resolve the R2 output prefix for a READY video. Used by the AES-128 HLS
   * manifest routes (which fetch + rewrite the stored playlists per request).
   */
  async getOutputPrefixForPlayback(tenantId: string, id: string): Promise<string> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    if (video.status !== video_status.ready) throw new NotFoundError("Video not ready");
    return video.output_prefix ?? `${tenantId}/${id}`;
  }

  /**
   * Mint a short-lived presigned URL for the processed downloadable MP4 (the
   * unencrypted master in the PRIVATE upload bucket). 404 until the worker has
   * produced it.
   */
  async getProcessedDownloadUrl(
    tenantId: string,
    id: string
  ): Promise<{ url: string; expiresIn: number; filename: string }> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    const ttl = 300;
    const pc = (video.pipeline_config ?? {}) as { title?: string };
    const base =
      typeof pc.title === "string" && pc.title.trim() ? pc.title.trim() : `video-${id.slice(0, 8)}`;
    const filename = `${base.replace(/[^\w.-]+/g, "_")}.mp4`;
    const url = await s3UploadService.getPresignedDownloadUrl(
      processedDownloadKey(tenantId, id),
      ttl,
      filename
    );
    if (!url) throw new NotFoundError("Processed download not available yet");
    return { url, expiresIn: ttl, filename };
  }

  async listVideos(
    tenantId: string,
    params: { status?: string; page?: number; limit?: number }
  ): Promise<{
    videos: VideoResponse[];
    total: number;
    page: number;
    limit: number;
    /** Tenant-wide total bytes in the R2 output bucket (sum of ready videos). */
    storageBytes: number;
  }> {
    const result = await videosRepository.listByTenant(tenantId, params);
    return { ...result, videos: result.videos.map(toVideoResponse) };
  }

  async retry(tenantId: string, id: string): Promise<VideoResponse> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    if (video.status !== video_status.failed) {
      throw new ConflictError(`Can only retry failed videos (current: ${video.status})`);
    }
    await videosRepository.retry(id, tenantId);
    return this.getVideo(tenantId, id);
  }

  async cancel(tenantId: string, id: string): Promise<VideoResponse> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    const ok = await videosRepository.cancel(id, tenantId);
    if (!ok) throw new ConflictError(`Cannot cancel a ${video.status} video`);
    return this.getVideo(tenantId, id);
  }

  /** PATCH /videos/:id, rename the video (title lives in pipeline_config). */
  async rename(tenantId: string, id: string, title: string): Promise<VideoResponse> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    await videosRepository.setTitle(id, tenantId, title.trim());
    return this.getVideo(tenantId, id);
  }

  /**
   * Mint a short-TTL playback token for a viewer. The CALLER (platform backend
   * via service auth) is responsible for the enrollment check; this just binds
   * the token to {tenant, user, video}. Video must exist; need not be ready yet
   * (player fetches the token then waits, but we 404 unknown videos).
   */
  async mintPlaybackToken(
    tenantId: string,
    id: string,
    userId: string,
    ttlSeconds?: number
  ): Promise<{ token: string; expiresAt: string; ttlSeconds: number; videoId: string }> {
    const video = await videosRepository.findByIdForTenant(id, tenantId);
    if (!video) throw new NotFoundError("Video not found");
    const minted = playbackTokenService.mint({ tenantId, userId, videoId: id, ttlSeconds });
    return { ...minted, videoId: id };
  }
}

export default new VideosService();
