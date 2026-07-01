import { ulid } from "ulid";
import type { Selectable, Transaction } from "kysely";
import { db } from "../db/connection";
import type { key_wrap_scheme } from "../db/enums";
import type { DB, video_keys } from "../db/types";

export type VideoKeyRow = Selectable<video_keys>;
type Trx = Transaction<DB>;

interface UpsertInput {
  videoId: string;
  tenantId: string;
  kidHex: string;
  wrappedKey: string;
  wrapScheme: keyof typeof key_wrap_scheme;
}

/** One content key per video. Written once at packaging time, read on playback. */
class VideoKeysRepository {
  async upsert(input: UpsertInput, trx?: Trx): Promise<VideoKeyRow> {
    const row = await (trx || db)
      .insertInto("video_keys")
      .values({
        id: ulid(),
        video_id: input.videoId,
        tenant_id: input.tenantId,
        kid_hex: input.kidHex,
        wrapped_key: input.wrappedKey,
        wrap_scheme: input.wrapScheme,
      })
      .onConflict((oc) =>
        oc.column("video_id").doUpdateSet({
          kid_hex: input.kidHex,
          wrapped_key: input.wrappedKey,
          wrap_scheme: input.wrapScheme,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return row;
  }

  async findByVideoId(videoId: string, tenantId: string): Promise<VideoKeyRow | null> {
    const row = await db
      .selectFrom("video_keys")
      .selectAll()
      .where("video_id", "=", videoId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    return row ?? null;
  }
}

export default new VideoKeysRepository();
