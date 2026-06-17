import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

import type { video_status, video_stage, protection_mode, watermark_mode, orientation, key_wrap_scheme } from "./enums";

export type video_keys = {
    id: Generated<string>;
    video_id: string;
    tenant_id: string;
    kid_hex: string;
    wrapped_key: string;
    wrap_scheme: Generated<key_wrap_scheme>;
    created_at: Generated<Timestamp>;
};
export type videos = {
    id: Generated<string>;
    tenant_id: string;
    status: Generated<video_status>;
    stage: video_stage | null;
    progress: Generated<number>;
    source_key: string | null;
    source_bytes: string | null;
    output_prefix: string | null;
    orientation: orientation | null;
    protection: Generated<protection_mode>;
    watermark: Generated<watermark_mode>;
    allow_offline: Generated<boolean>;
    captions_langs: Generated<string[]>;
    locked_by: string | null;
    locked_at: Timestamp | null;
    heartbeat_at: Timestamp | null;
    attempts: Generated<number>;
    max_attempts: Generated<number>;
    pipeline_config: Generated<unknown>;
    error: string | null;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    ready_at: Timestamp | null;
};
export type DB = {
    video_keys: video_keys;
    videos: videos;
};
