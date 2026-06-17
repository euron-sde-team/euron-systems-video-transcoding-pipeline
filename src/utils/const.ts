/** Upload extensions S3 will accept. Lowercased, no dot. */
export const ALLOWED_UPLOAD_EXT = new Set(["mp4", "mov", "mkv", "webm", "m4v"]);

/** Output filenames produced by the packager + thumbnail pass (relative to output_prefix). */
export const OUTPUT_FILES = {
  hlsMaster: "master.m3u8",
  dashManifest: "manifest.mpd",
  poster: "poster.jpg",
  thumbnailsVtt: "thumbnails/thumbnails.vtt",
} as const;
