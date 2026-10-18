import { z } from "zod";
import { departmentSchema, type DepartmentKey } from "@tfl/shared";
import type { DB } from "./db.js";
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export const reportQuerySchema = page.extend({
  department: departmentSchema.optional(),
  search: z.string().max(120).optional(),
  project: z.string().max(80).optional(),
  source: z.enum(["bot", "github", "discord_manual", "manual"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  authorId: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  syncState: z
    .enum(["complete", "partial", "unknown", "missing", "deleted"])
    .optional(),
  publicationStatus: z
    .enum([
      "queued",
      "publishing",
      "published",
      "needs_reconciliation",
      "indexed",
      "deleted",
      "cancelled",
    ])
    .optional(),
  channelId: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  order: z.enum(["newest", "oldest"]).default("newest"),
});
export async function listReportRows(
  db: DB,
  selected: DepartmentKey[],
  q: z.infer<typeof reportQuerySchema>,
) {
  const sort = q.order === "oldest" ? "ASC" : "DESC";
  const result = await db.query(
    "SELECT id,department,project,source,title,description,created_by,author_id,discord_channel_id," +
      "discord_message_id,discord_thread_id,content_state,sync_state,publication_status,tags,thread_archived," +
      "thread_locked,occurred_at,updated_at FROM reports " +
      "WHERE department=ANY($1::text[]) " +
      "AND ($2::text IS NULL OR title ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%') " +
      "AND ($5::text IS NULL OR project=$5) AND ($6::text IS NULL OR source=$6) " +
      "AND ($7::timestamptz IS NULL OR occurred_at >=$7) AND ($8::timestamptz IS NULL OR occurred_at <=$8) " +
      "AND ($9::text IS NULL OR created_by=$9 OR author_id=$9) " +
      "AND ($10::text IS NULL OR sync_state=$10) AND ($11::text IS NULL OR publication_status=$11) " +
      "AND ($12::text IS NULL OR discord_channel_id=$12) " +
      "ORDER BY occurred_at " +
      sort +
      ",id " +
      sort +
      " LIMIT $3 OFFSET $4",
    [
      selected,
      q.search ?? null,
      q.limit,
      q.offset,
      q.project ?? null,
      q.source ?? null,
      q.from ?? null,
      q.to ?? null,
      q.authorId ?? null,
      q.syncState ?? null,
      q.publicationStatus ?? null,
      q.channelId ?? null,
    ],
  );
  return result;
}
