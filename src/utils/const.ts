/** Upload extensions S3 will accept. Lowercased, no dot. */
export const ALLOWED_UPLOAD_EXT = new Set(["mp4", "mov", "mkv", "webm", "m4v"]);

/** Output filenames produced by the packager + thumbnail pass (relative to output_prefix). */
export const OUTPUT_FILES = {
  hlsMaster: "master.m3u8",
  dashManifest: "manifest.mpd",
  poster: "poster.jpg",
  thumbnailsVtt: "thumbnails/thumbnails.vtt",
  /** AES-128 HLS-TS master (Safari native path); served + rewritten by the API. */
  hlsAesMaster: "hls-aes/master.m3u8",
} as const;

/**
 * Private upload-bucket key of the processed downloadable MP4 (the unencrypted
 * master offered to the uploader). Convention-derived so the worker (writer) and
 * the API (presigner) agree without a DB column.
 */
export const processedDownloadKey = (tenantId: string, videoId: string): string =>
  `processed/${tenantId}/${videoId}.mp4`;

/**
 * Sentinel baked into the AES-128 HLS EXT-X-KEY URI at transcode time. The API's
 * manifest route does a literal replace of this with the authed, tokenized key URL
 * per request (the playback token can't be known when the worker packages). Shared
 * here so the worker (writer) and the API (rewriter) never drift.
 */
export const HLS_AES_KEY_URI_PLACEHOLDER = "EURON_AES_KEY_URI";
