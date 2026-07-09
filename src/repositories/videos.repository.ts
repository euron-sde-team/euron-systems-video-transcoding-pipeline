import { ulid } from "ulid";
import type { Selectable, Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "../db/connection";
import { video_status } from "../db/enums";
import type { DB, videos } from "../db/types";

export type VideoRow = Selectable<videos>;

type Trx = Transaction<DB>;

interface CreateVideoInput {
  tenantId: string;
  sourceKey: string;
  outputPrefix: string;
  /** Human-friendly title; stored inside pipeline_config (no schema column). */
  title?: string;
}

interface ListParams {
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * All reads/writes for the `videos` table EXCEPT the queue-claim mechanics,
 * which live in db/queue.ts (raw SQL with FOR UPDATE SKIP LOCKED). Every method
 * is tenant-scoped, tenant_id is in every WHERE clause.
 */
class VideosRepository {
  async create(input: CreateVideoInput, trx?: Trx): Promise<VideoRow> {
    const id = ulid();
    const row = await (trx || db)
      .insertInto("videos")
      .values({
        id,
        tenant_id: input.tenantId,
        status: video_status.uploading,
        source_key: input.sourceKey,
        output_prefix: input.outputPrefix,
        // pipeline_config is jsonb; pass a JSON string (never double-serialize).
        ...(input.title ? { pipeline_config: JSON.stringify({ title: input.title }) } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return row;
  }

  /** Merge a new title into pipeline_config jsonb (atomic, preserves other keys). */
  async setTitle(id: string, tenantId: string, title: string): Promise<boolean> {
    const result = await db
      .updateTable("videos")
      .set({
        pipeline_config: sql`coalesce(pipeline_config, '{}'::jsonb) || jsonb_build_object('title', ${title}::text)`,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n) > 0;
  }

  async findById(id: string, trx?: Trx): Promise<VideoRow | null> {
    const row = await (trx || db)
      .selectFrom("videos")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ?? null;
  }

  async findByIdForTenant(id: string, tenantId: string, trx?: Trx): Promise<VideoRow | null> {
    const row = await (trx || db)
      .selectFrom("videos")
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    return row ?? null;
  }

  /** Batch fetch (tenant-scoped). Used to resolve output_prefix for live R2 sizing. */
  async findByIdsForTenant(ids: string[], tenantId: string): Promise<VideoRow[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .selectFrom("videos")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "in", ids)
      .execute();
    return rows as VideoRow[];
  }

  /** In-flight count = uploads not yet terminal. Gates the per-tenant cap. */
  async countInFlight(tenantId: string): Promise<number> {
    const row = await db
      .selectFrom("videos")
      .select(db.fn.countAll<string>().as("n"))
      .where("tenant_id", "=", tenantId)
      .where("status", "in", [
        video_status.uploading,
        video_status.uploaded,
        video_status.processing,
      ])
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /** ENQUEUE: uploading → uploaded, recording the verified byte size. Returns true if flipped. */
  async markUploaded(id: string, tenantId: string, sourceBytes: number): Promise<boolean> {
    const result = await db
      .updateTable("videos")
      .set({
        status: video_status.uploaded,
        source_bytes: String(sourceBytes), // pg bigint ↔ JS string
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", video_status.uploading)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n) > 0;
  }

  async listByTenant(
    tenantId: string,
    params: ListParams
  ): Promise<{
    videos: VideoRow[];
    total: number;
    page: number;
    limit: number;
    storageBytes: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    let listQuery = db.selectFrom("videos").selectAll().where("tenant_id", "=", tenantId);
    let countQuery = db
      .selectFrom("videos")
      .select(db.fn.countAll<string>().as("n"))
      .where("tenant_id", "=", tenantId);

    if (params.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      listQuery = listQuery.where("status", "=", params.status as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countQuery = countQuery.where("status", "=", params.status as any);
    }

    const [rows, countRow, storageBytes] = await Promise.all([
      listQuery.orderBy("created_at", "desc").limit(limit).offset(offset).execute(),
      countQuery.executeTakeFirst(),
      // Tenant-wide total, NOT scoped by the status filter, the storage figure
      // should reflect everything occupying the output bucket regardless of view.
      this.sumOutputBytesByTenant(tenantId),
    ]);

    return {
      videos: rows as VideoRow[],
      total: Number(countRow?.n ?? 0),
      page,
      limit,
      storageBytes,
    };
  }

  /**
   * Total bytes the tenant's processed assets occupy in the R2 output bucket.
   * Only 'ready' rows ever carry output_bytes (set in markReady); NULLs are
   * ignored by SUM, so legacy pre-column videos count as 0 until reprocessed.
   * pg returns SUM(bigint) as a string, parse before returning.
   */
  async sumOutputBytesByTenant(tenantId: string): Promise<number> {
    const row = await db
      .selectFrom("videos")
      .select((eb) => eb.fn.sum<string>("output_bytes").as("total"))
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    const total = row?.total;
    return total == null ? 0 : typeof total === "string" ? parseInt(total, 10) : Number(total);
  }

  /** RETRY: failed → uploaded, resetting attempts so the worker reprocesses it. */
  async retry(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .updateTable("videos")
      .set({
        status: video_status.uploaded,
        attempts: 0,
        error: null,
        stage: null,
        locked_by: null,
        locked_at: null,
        heartbeat_at: null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", video_status.failed)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n) > 0;
  }

  /**
   * CANCEL: every pre-ready state, INCLUDING 'processing'. Cancelling mid-transcode
   * is safe: the worker's guarded heartbeat (WHERE status='processing') returns 0
   * rows, fires its AbortController, and SIGKILLs the in-flight ffmpeg within one
   * heartbeat interval; every terminal worker write (markReadyAndEnqueue,
   * failOrRequeue, releaseClaim) is equally guarded, so nothing resurrects or
   * clobbers the cancelled row. 'ready' stays excluded (retiring a ready video is
   * the tenant-admin reconcile's job, fully reference-guarded).
   */
  async cancel(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .updateTable("videos")
      .set({ status: video_status.cancelled, updated_at: new Date() })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("status", "in", [
        video_status.uploading,
        video_status.uploaded,
        video_status.processing,
        video_status.failed,
      ])
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n) > 0;
  }
}

export default new VideosRepository();
