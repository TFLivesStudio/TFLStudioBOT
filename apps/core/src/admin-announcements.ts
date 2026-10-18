import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { IDS } from "./ids.js";
import { visualSchema, validateDiscordAnnouncement } from "./presentation.js";

const id = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const draft = z.object({
  targetChannelId: z.string().regex(/^\d{17,20}$/),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(1800),
  visual: visualSchema.default({ embeds: [] }),
});
const update = draft.extend({ expectedVersion: z.number().int().positive() });
const template = z.object({
  name: z.string().trim().min(1).max(90),
  visual: visualSchema,
});
const err = (msg: string, statusCode = 409) =>
  Object.assign(new Error(msg), { statusCode });
const reference = (id: string) => "STUDIO-ANNOUNCEMENT-" + id;

async function queue(
  db: DB,
  announcementId: number,
  runAt: string,
  mode: "schedule" | "reschedule" | "now",
  requestedBy: string,
): Promise<void> {
  await transaction(db, async (c) => {
    const current = await c.query<{
      status: string;
      title: string;
      body: string;
      visual_payload: unknown;
    }>(
      "SELECT status,title,body,visual_payload FROM announcements WHERE id=$1 FOR UPDATE",
      [announcementId],
    );
    const old = current.rows[0];
    if (!old) throw err("Announcement not found", 404);
    if (
      mode === "reschedule"
        ? old.status !== "scheduled"
        : old.status !== "draft"
    )
      throw err("Announcement is not eligible for scheduling");
    validateDiscordAnnouncement(
      old.title,
      old.body,
      old.visual_payload,
      reference(String(announcementId)),
    );
    if (mode === "reschedule") {
      const job = await c.query(
        "UPDATE automation_jobs SET run_at=$2,payload=jsonb_set(payload,'{requestedBy}',to_jsonb($3::text)) WHERE dedup_key=$1 AND status='queued' RETURNING id",
        ["announcement:" + announcementId, runAt, requestedBy],
      );
      if (!job.rowCount)
        throw err("Publication is already running or requires reconciliation");
    } else {
      await c.query(
        "INSERT INTO automation_jobs(kind,payload,run_at,dedup_key,origin,destination,correlation) " +
          "VALUES('announcement',$1,$2,$3,'admin',$4,$5)",
        [
          JSON.stringify({ id: String(announcementId), requestedBy }),
          runAt,
          "announcement:" + announcementId,
          IDS.channels.anuncios,
          reference(String(announcementId)),
        ],
      );
    }
    await c.query(
      "UPDATE announcements SET status='scheduled',scheduled_at=$2,updated_at=now(),version=version+1 WHERE id=$1",
      [announcementId, runAt],
    );
  });
}
export async function registerAnnouncementRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.get("/api/v1/announcements", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        status: z
          .enum([
            "draft",
            "scheduled",
            "publishing",
            "published",
            "failed",
            "cancelled",
          ])
          .optional(),
      })
      .parse(req.query);
    const result = await db.query(
      "SELECT * FROM announcements WHERE ($1::text IS NULL OR status=$1) ORDER BY id DESC LIMIT $2 OFFSET $3",
      [q.status ?? null, q.limit, q.offset],
    );
    return { items: result.rows, ...q };
  });
  app.get("/api/v1/announcements/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: announcementId } = id.parse(req.params);
    const found = await db.query("SELECT * FROM announcements WHERE id=$1", [
      announcementId,
    ]);
    if (!found.rows[0]) throw err("Announcement not found", 404);
    return { item: found.rows[0] };
  });
  app.get("/api/v1/announcements/:id/revisions", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: announcementId } = id.parse(req.params);
    const q = page.parse(req.query);
    return {
      items: (
        await db.query(
          "SELECT version,title,body,visual_payload,edited_by,edited_at FROM announcement_revisions WHERE announcement_id=$1 ORDER BY version DESC LIMIT $2 OFFSET $3",
          [announcementId, q.limit, q.offset],
        )
      ).rows,
      ...q,
    };
  });
  app.get("/api/v1/announcements/:id/history", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: announcementId } = id.parse(req.params);
    const q = page.parse(req.query);
    const result = await db.query(
      "SELECT id,actor_id,action,meta,occurred_at FROM audit_events " +
        "WHERE target_kind='announcement' AND target_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [String(announcementId), q.limit, q.offset],
    );
    return { items: result.rows, ...q };
  });
  app.post("/api/v1/announcements", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const data = draft.parse(req.body);
    if (data.targetChannelId !== IDS.channels.anuncios)
      throw err("Destination not in whitelist", 400);
    validateDiscordAnnouncement(
      data.title,
      data.body,
      data.visual,
      reference("99999999999999999999"),
    );
    const result = await db.query<{ id: string }>(
      "INSERT INTO announcements(target_channel_id,title,body,author_id,updated_by,visual_payload) " +
        "VALUES($1,$2,$3,$4,$4,$5) RETURNING id",
      [
        data.targetChannelId,
        data.title,
        data.body,
        actor.userId,
        JSON.stringify(data.visual),
      ],
    );
    await audit(
      db,
      "announcement.create",
      actor.userId,
      "announcement",
      result.rows[0]!.id,
    );
    return { id: result.rows[0]!.id, status: "draft" };
  });
  app.patch("/api/v1/announcements/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    const data = update.parse(req.body);
    if (data.targetChannelId !== IDS.channels.anuncios)
      throw err("Destination not allowed", 400);
    validateDiscordAnnouncement(
      data.title,
      data.body,
      data.visual,
      reference(String(announcementId)),
    );
    const result = await transaction(db, async (c) => {
      const previous = await c.query<{
        title: string;
        body: string;
        visual_payload: unknown;
        version: number;
        status: string;
      }>(
        "SELECT title,body,visual_payload,version,status FROM announcements WHERE id=$1 FOR UPDATE",
        [announcementId],
      );
      const row = previous.rows[0];
      if (
        !row ||
        row.version !== data.expectedVersion ||
        row.status !== "draft"
      )
        throw err("Draft modified concurrently or already scheduled");
      await c.query(
        "INSERT INTO announcement_revisions(announcement_id,version,title,body,visual_payload,edited_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          announcementId,
          row.version,
          row.title,
          row.body,
          JSON.stringify(row.visual_payload),
          actor.userId,
        ],
      );
      const result = await c.query<{ version: number }>(
        "UPDATE announcements SET title=$3,body=$4,target_channel_id=$5,visual_payload=$6," +
          "version=version+1,updated_at=now(),updated_by=$7 " +
          "WHERE id=$1 AND version=$2 AND status='draft' RETURNING version",
        [
          announcementId,
          data.expectedVersion,
          data.title,
          data.body,
          data.targetChannelId,
          JSON.stringify(data.visual),
          actor.userId,
        ],
      );
      if (!result.rows[0])
        throw err("Draft modified concurrently or already scheduled");
      return result;
    });
    await audit(
      db,
      "announcement.edit",
      actor.userId,
      "announcement",
      String(announcementId),
      { version: result.rows[0]!.version },
    );
    return { id: announcementId, version: result.rows[0]!.version };
  });
  app.post("/api/v1/announcements/:id/duplicate", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    const result = await db.query<{ id: string }>(
      "INSERT INTO announcements(target_channel_id,title,body,author_id,updated_by,visual_payload,status) " +
        "SELECT target_channel_id,left(title||' (copia)',100),body,$2,$2,visual_payload,'draft' " +
        "FROM announcements WHERE id=$1 RETURNING id",
      [announcementId, actor.userId],
    );
    if (!result.rows[0]) throw err("Announcement not found", 404);
    await audit(
      db,
      "announcement.duplicate",
      actor.userId,
      "announcement",
      result.rows[0].id,
      { sourceId: announcementId },
    );
    return { id: result.rows[0].id, status: "draft" };
  });
  app.get("/api/v1/announcements/:id/preview", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: announcementId } = id.parse(req.params);
    const result = await db.query<{
      title: string;
      body: string;
      visual_payload: unknown;
      status: string;
    }>(
      "SELECT title,body,visual_payload,status FROM announcements WHERE id=$1",
      [announcementId],
    );
    const item = result.rows[0];
    if (!item) throw err("Announcement not found", 404);
    const data = validateDiscordAnnouncement(
      item.title,
      item.body,
      item.visual_payload,
      reference(String(announcementId)),
    );
    return {
      valid: true,
      payload: data,
      status: item.status,
      kind: "Discord API payload approximation",
      note: "Not a pixel-identical Discord client render and not a remote publication",
    };
  });
  app.post("/api/v1/announcements/:id/schedule", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    const data = z
      .object({ runAt: z.string().datetime(), confirm: z.literal(true) })
      .parse(req.body);
    await queue(db, announcementId, data.runAt, "schedule", actor.userId);
    await audit(
      db,
      "announcement.schedule",
      actor.userId,
      "announcement",
      String(announcementId),
      { runAt: data.runAt },
    );
    return { ok: true, status: "scheduled" };
  });
  app.post("/api/v1/announcements/:id/reschedule", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    const data = z
      .object({ runAt: z.string().datetime(), confirm: z.literal(true) })
      .parse(req.body);
    await queue(db, announcementId, data.runAt, "reschedule", actor.userId);
    await audit(
      db,
      "announcement.reschedule",
      actor.userId,
      "announcement",
      String(announcementId),
      { runAt: data.runAt },
    );
    return { ok: true, status: "scheduled" };
  });
  app.post("/api/v1/announcements/:id/publish-now", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    z.object({ confirm: z.literal(true) }).parse(req.body);
    await queue(
      db,
      announcementId,
      new Date().toISOString(),
      "now",
      actor.userId,
    );
    await audit(
      db,
      "announcement.publish.request",
      actor.userId,
      "announcement",
      String(announcementId),
    );
    return {
      ok: true,
      status: "scheduled",
      note: "Queued for controlled worker publication",
    };
  });
  app.post("/api/v1/announcements/:id/cancel", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: announcementId } = id.parse(req.params);
    const data = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .parse(req.body);
    await transaction(db, async (c) => {
      const job = await c.query(
        "UPDATE automation_jobs SET status='cancelled',last_error='Cancelled by ADMIN',updated_at=now() " +
          "WHERE dedup_key=$1 AND kind='announcement' AND status='queued' RETURNING id",
        ["announcement:" + announcementId],
      );
      if (!job.rowCount)
        throw err("Publication already started or is not queued");
      await c.query(
        "UPDATE announcements SET status='cancelled',cancelled_at=now(),updated_at=now()," +
          "version=version+1 WHERE id=$1 AND status='scheduled'",
        [announcementId],
      );
    });
    await audit(
      db,
      "announcement.cancel",
      actor.userId,
      "announcement",
      String(announcementId),
      { reason: data.reason },
    );
    return { ok: true, status: "cancelled" };
  });
  app.get("/api/v1/announcements/templates", async (req) => {
    await requireUser(req, db, config, { admin: true });
    return {
      items: (
        await db.query("SELECT * FROM announcement_templates ORDER BY name")
      ).rows,
    };
  });
  app.post("/api/v1/announcements/templates", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const data = template.parse(req.body);
    const created = await db.query<{ id: string }>(
      "INSERT INTO announcement_templates(name,visual_payload,created_by,updated_by) VALUES($1,$2,$3,$3) RETURNING id",
      [data.name, JSON.stringify(data.visual), actor.userId],
    );
    await audit(
      db,
      "template.create",
      actor.userId,
      "announcement_template",
      created.rows[0]!.id,
    );
    return { id: created.rows[0]!.id };
  });
  app.patch("/api/v1/announcements/templates/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: templateId } = id.parse(req.params);
    const data = template
      .extend({ expectedVersion: z.number().int().positive() })
      .parse(req.body);
    const changed = await db.query<{ version: number }>(
      "UPDATE announcement_templates SET name=$3,visual_payload=$4,updated_at=now(),updated_by=$5,version=version+1 " +
        "WHERE id=$1 AND version=$2 AND enabled RETURNING version",
      [
        templateId,
        data.expectedVersion,
        data.name,
        JSON.stringify(data.visual),
        actor.userId,
      ],
    );
    if (!changed.rows[0]) throw err("Template edited concurrently or disabled");
    await audit(
      db,
      "template.update",
      actor.userId,
      "announcement_template",
      String(templateId),
    );
    return { ok: true, version: changed.rows[0].version };
  });
  app.post("/api/v1/announcements/templates/:id/disable", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: templateId } = id.parse(req.params);
    const updated = await db.query(
      "UPDATE announcement_templates SET enabled=false,updated_at=now(),updated_by=$2,version=version+1 " +
        "WHERE id=$1 AND enabled RETURNING id",
      [templateId, actor.userId],
    );
    if (!updated.rowCount) throw err("Template not active", 404);
    await audit(
      db,
      "template.disable",
      actor.userId,
      "announcement_template",
      String(templateId),
    );
    return { ok: true };
  });
}
