export const video_status = {
    uploading: "uploading",
    uploaded: "uploaded",
    processing: "processing",
    ready: "ready",
    failed: "failed",
    cancelled: "cancelled"
} as const;
export type video_status = (typeof video_status)[keyof typeof video_status];
export const video_stage = {
    transcoding: "transcoding",
    transcribing: "transcribing",
    packaging: "packaging",
    uploading_output: "uploading_output"
} as const;
export type video_stage = (typeof video_stage)[keyof typeof video_stage];
export const protection_mode = {
    none: "none",
    aes_128: "aes_128",
    drm_cbcs: "drm_cbcs"
} as const;
export type protection_mode = (typeof protection_mode)[keyof typeof protection_mode];
export const watermark_mode = {
    none: "none",
    dynamic_overlay: "dynamic_overlay",
    forensic_ab: "forensic_ab"
} as const;
export type watermark_mode = (typeof watermark_mode)[keyof typeof watermark_mode];
export const orientation = {
    landscape: "landscape",
    portrait: "portrait",
    square: "square"
} as const;
export type orientation = (typeof orientation)[keyof typeof orientation];
export const key_wrap_scheme = {
    kms: "kms",
    local_aes: "local_aes"
} as const;
export type key_wrap_scheme = (typeof key_wrap_scheme)[keyof typeof key_wrap_scheme];
