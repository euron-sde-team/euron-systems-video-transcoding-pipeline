// Mirrors the pipeline API contract (the INNER `data` of the response envelope).

export type VideoStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled";

export type VideoStage =
  | "transcoding"
  | "transcribing"
  | "packaging"
  | "uploading_output";

export type Orientation = "landscape" | "portrait" | "square";

/** Delivery manifest to play. Both cover the same CMAF segment set. */
export type StreamFormat = "hls" | "dash";

export type WatermarkMode = "none" | "dynamic_overlay" | "forensic_ab";

export interface PlaybackInfo {
  // NOT IN USE (HLS-only migration): cbcs CMAF HLS + DASH URLs (removed from DTO).
  // hls: string;
  // dash: string;
  /**
   * RELATIVE AES-128 HLS master path ("/videos/:id/hls/master.m3u8"). Both hls.js
   * (non-iOS) and native Safari/iOS load this; the player appends ?token=.
   */
  hlsAes: string;
  /** Absolute CDN URL to the poster image. */
  poster: string;
  /** Absolute CDN URL to the WebVTT sprite thumbnails. */
  thumbnailsVtt: string;
  // NOT IN USE (HLS-only migration): Shaka clearKeys fetch endpoint (the key URI is
  // injected into the rewritten manifest now).
  // keyEndpoint: string;
}

export interface VideoResponse {
  id: string;
  tenantId: string;
  title: string | null;
  displayName: string;
  status: VideoStatus;
  stage: VideoStage | null;
  progress: number;
  orientation: Orientation | null;
  protection: string;
  watermark: WatermarkMode | string;
  allowOffline: boolean;
  captionsLangs: string[];
  sourceBytes: number | null;
  /** R2 output-bucket key prefix for this video's assets ("{tenantId}/{id}"). */
  outputPrefix: string;
  /** Total bytes this video's assets occupy in the R2 output bucket; null until ready. */
  outputBytes: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  /** API-relative link to the processed downloadable MP4 ("/videos/:id/download"). */
  download?: string | null;
  playback?: PlaybackInfo | null;
}

export interface VideoListResponse {
  videos: VideoResponse[];
  total: number;
  page: number;
  limit: number;
  /** Tenant-wide total bytes in the R2 output bucket (sum of ready videos). */
  storageBytes: number;
}

/** One video's LIVE R2 footprint (sum of objects under its output prefix). */
export interface VideoStorageItem {
  id: string;
  bytes: number;
}

/** Batch live R2 storage for a set of videos (the visible dashboard cards). */
export interface VideoStorageResponse {
  items: VideoStorageItem[];
  total: number;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface CreateUploadResponse {
  videoId: string;
  upload: PresignedUpload;
}

export interface CompleteUploadResponse {
  videoId: string;
  status: VideoStatus;
}

export interface PlaybackTokenResponse {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  videoId: string;
}

/** Short-lived signed URL for the processed downloadable MP4 (GET /videos/:id/download). */
export interface DownloadResponse {
  /** Presigned R2 GET URL; carries Content-Disposition: attachment. */
  url: string;
  /** Seconds the URL stays valid. */
  expiresIn: number;
  /** Friendly "Save as" filename derived from the video title. */
  filename: string;
}

export interface ClearKeyResponse {
  kid: string;
  k: string;
  clearKeys: Record<string, string>;
}

export interface HealthResponse {
  service: string;
  status: string;
  time: string;
}
