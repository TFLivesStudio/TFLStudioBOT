import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { requireUser, isAdmin } from "./auth.js";
import { canUseChannel, visibleDepartments } from "./permissions.js";
import { DEPARTMENTS, IDS, type DepartmentKey } from "./ids.js";
import { audit } from "./audit.js";

const depart = z.enum(
  Object.keys(DEPARTMENTS) as [DepartmentKey, ...DepartmentKey[]],
);
const id = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const content = z.object({
  category: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(15000),
  visibilityDepartment: depart.nullable(),
});
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
type Guide = {
  id: string;
  version: number;
  title: string;
  body: string;
  category: string;
  visibility_department: DepartmentKey | null;
  lifecycle: string;
  discord_thread_id: string | null;
};
async function updateVersioned(
  db: DB,
  idValue: number,
  expected: number,
  actor: string,
  change: (old: Guide) => Partial<Guide>,
  action: string,
): Promise<number> {
  return transaction(db, async (c) => {
    const found = await c.query<Guide>(
      "SELECT * FROM guides WHERE id=$1 FOR UPDATE",
      [idValue],
    );
    const previous = found.rows[0];
    if (!previous) throw fail("Guide not found", 404);
    if (previous.version !== expected)
      throw fail("Guide changed: refresh before saving");
    await c.query(
      "INSERT INTO guide_revisions(guide_id,version,title,body,category,visibility_department,edited_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        idValue,
        previous.version,
        previous.title,
        previous.body,
        previous.category,
        previous.visibility_department,
        actor,
      ],
    );
    const next = { ...previous, ...change(previous) };
    const result = await c.query<{ version: number }>(
      "UPDATE guides SET title=$2,body=$3,category=$4,visibility_department=$5,lifecycle=$6," +
        "discord_sync_state=CASE WHEN discord_thread_id IS NULL THEN 'unlinked' ELSE 'conflict' END," +
        "version=version+1,updated_by=$7,updated_at=now() WHERE id=$1 RETURNING version",
      [
        idValue,
        next.title,
        next.body,
        next.category,
        next.visibility_department,
        next.lifecycle,
        actor,
      ],
    );
    await c.query(
      "INSERT INTO audit_events(actor_id,action,target_kind,target_id,meta) VALUES($1,$2,'guide',$3,$4)",
      [
        actor,
        action,
        String(idValue),
        JSON.stringify({
          beforeVersion: previous.version,
          version: result.rows[0]!.version,
        }),
      ],
    );
    return result.rows[0]!.version;
  });
}
export async function registerGuideRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
  discord: Client,
): Promise<void> {
  app.get("/api/v1/guides", async (req) => {
    const actor = await requireUser(req, db, config);
    const q = page
      .extend({
        category: z.string().max(100).optional(),
        search: z.string().max(120).optional(),
        department: depart.optional(),
        lifecycle: z.enum(["active", "archived"]).optional(),
      })
      .parse(req.query);
    const admin = isAdmin(actor, config);
    const allowed = admin
      ? Object.keys(DEPARTMENTS)
      : await visibleDepartments(config, actor);
    if (q.department && !admin && !allowed.includes(q.department))
      throw fail("Not allowed", 403);
    const results = await db.query(
      "SELECT id,category,title,body,visibility_department,discord_thread_id,discord_sync_state," +
        "discord_synced_version,version,lifecycle,updated_at FROM guides " +
        "WHERE ($1::boolean OR lifecycle='active') AND ($2::text IS NULL OR lifecycle=$2) " +
        "AND (visibility_department IS NULL OR $1 OR visibility_department=ANY($3::text[])) " +
        "AND ($4::text IS NULL OR visibility_department=$4) " +
        "AND ($5::text IS NULL OR category=$5) " +
        "AND ($6::text IS NULL OR title ILIKE '%'||$6||'%' OR body ILIKE '%'||$6||'%') " +
        "ORDER BY updated_at DESC,id DESC LIMIT $7 OFFSET $8",
      [
        admin,
        q.lifecycle ?? null,
        allowed,
        q.department ?? null,
        q.category ?? null,
        q.search ?? null,
        q.limit,
        q.offset,
      ],
    );
    return {
      items: results.rows,
      limit: q.limit,
      offset: q.offset,
      completeness: "stored_guides_only",
    };
  });
  app.get("/api/v1/guides/:id", async (req) => {
    const actor = await requireUser(req, db, config);
    const { id: guideId } = id.parse(req.params);
    const rows = await db.query<Guide>("SELECT * FROM guides WHERE id=$1", [
      guideId,
    ]);
    const item = rows.rows[0];
    if (!item) throw fail("Guide not found", 404);
    if (!isAdmin(actor, config)) {
      if (item.lifecycle !== "active") throw fail("Not found", 404);
      if (
        item.visibility_department &&
        !(await canUseChannel(
          config,
          actor,
          item.visibility_department,
          "read",
        ))
      )
        throw fail("Forbidden", 403);
    }
    return { item };
  });
  app.post("/api/v1/guides", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const d = content
      .extend({ visibilityDepartment: depart.nullable().default(null) })
      .parse(req.body);
    const created = await db.query<{ id: string }>(
      "INSERT INTO guides(category,title,body,visibility_department,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [d.category, d.title, d.body, d.visibilityDepartment, actor.userId],
    );
    await audit(db, "guide.create", actor.userId, "guide", created.rows[0]!.id);
    return { id: created.rows[0]!.id, version: 1 };
  });
  app.patch("/api/v1/guides/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: guideId } = id.parse(req.params);
    const d = content
      .extend({ expectedVersion: z.number().int().positive() })
      .parse(req.body);
    const version = await updateVersioned(
      db,
      guideId,
      d.expectedVersion,
      actor.userId,
      () => ({
        category: d.category,
        title: d.title,
        body: d.body,
        visibility_department: d.visibilityDepartment,
      }),
      "guide.edit",
    );
    return { id: guideId, version };
  });
  app.get("/api/v1/guides/:id/revisions", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: guideId } = id.parse(req.params);
    const items = await db.query(
      "SELECT version,title,body,category,visibility_department,edited_by,edited_at " +
        "FROM guide_revisions WHERE guide_id=$1 ORDER BY version DESC",
      [guideId],
    );
    const current = await db.query(
      "SELECT version,title,body,category,visibility_department,lifecycle,updated_at FROM guides WHERE id=$1",
      [guideId],
    );
    if (!current.rows[0]) throw fail("Guide not found", 404);
    return { current: current.rows[0], revisions: items.rows };
  });
  app.post("/api/v1/guides/:id/restore", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: guideId } = id.parse(req.params);
    const d = z
      .object({
        expectedVersion: z.number().int().positive(),
        restoreVersion: z.number().int().positive(),
      })
      .parse(req.body);
    const prior = await db.query<Guide>(
      "SELECT title,body,category,visibility_department FROM guide_revisions WHERE guide_id=$1 AND version=$2",
      [guideId, d.restoreVersion],
    );
    if (!prior.rows[0]) throw fail("Requested revision unavailable", 404);
    const restored = prior.rows[0]!;
    const version = await updateVersioned(
      db,
      guideId,
      d.expectedVersion,
      actor.userId,
      () => ({
        title: restored.title,
        body: restored.body,
        category: restored.category,
        visibility_department: restored.visibility_department,
      }),
      "guide.restore",
    );
    return { ok: true, version, restoredFrom: d.restoreVersion };
  });
  app.post("/api/v1/guides/:id/archive", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: guideId } = id.parse(req.params);
    const d = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(req.body);
    const version = await updateVersioned(
      db,
      guideId,
      d.expectedVersion,
      actor.userId,
      () => ({ lifecycle: "archived" }),
      "guide.archive",
    );
    return { ok: true, version };
  });
  app.post("/api/v1/guides/:id/link", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: guideId } = id.parse(req.params);
    const d = z
      .object({
        expectedVersion: z.number().int().positive(),
        threadId: z.string().regex(/^\d{17,20}$/),
      })
      .parse(req.body);
    const channel = await discord.channels.fetch(d.threadId);
    if (
      !channel?.isThread() ||
      channel.guildId !== config.DISCORD_GUILD_ID ||
      channel.parentId !== IDS.channels.guias
    )
      throw fail("Not an authorized TFL Studio guide thread");
    const updated = await db.query(
      "UPDATE guides SET discord_thread_id=$3,discord_sync_state='linked',discord_synced_version=NULL," +
        "version=version+1,updated_by=$4,updated_at=now() " +
        "WHERE id=$1 AND version=$2 AND lifecycle='active' RETURNING id",
      [guideId, d.expectedVersion, d.threadId, actor.userId],
    );
    if (!updated.rowCount) throw fail("Guide changed or archived");
    await audit(db, "guide.link", actor.userId, "guide", String(guideId), {
      threadId: d.threadId,
    });
    return { ok: true, syncState: "linked", verifiedContent: false };
  });
  app.post("/api/v1/guides/:id/publish", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: guideId } = id.parse(req.params);
    const d = z
      .object({
        expectedVersion: z.number().int().positive(),
        confirm: z.literal(true),
        tagIds: z
          .array(z.string().regex(/^\d{17,20}$/))
          .max(5)
          .default([]),
      })
      .parse(req.body);
    await transaction(db, async (c) => {
      const current = await c.query<Guide>(
        "SELECT * FROM guides WHERE id=$1 FOR UPDATE",
        [guideId],
      );
      const item = current.rows[0];
      if (
        !item ||
        item.lifecycle !== "active" ||
        item.discord_thread_id ||
        item.version !== d.expectedVersion
      )
        throw fail("Guide already linked, archived or edited concurrently");
      if (item.body.length > 1450)
        throw fail(
          "Guide exceeds a single Discord post; link an existing thread or shorten",
          409,
        );
      await c.query(
        "UPDATE guides SET discord_sync_state='queued' WHERE id=$1",
        [guideId],
      );
      await c.query(
        "INSERT INTO automation_jobs(kind,payload,dedup_key,origin,destination,correlation) " +
          "VALUES('guide_publish',$1,$2,'admin',$3,$4) ON CONFLICT(dedup_key) DO NOTHING",
        [
          JSON.stringify({
            id: String(guideId),
            version: item.version,
            tagIds: d.tagIds,
            requestedBy: actor.userId,
          }),
          "guide:" + guideId + ":" + item.version,
          IDS.channels.guias,
          "STUDIO-GUIDE-" + guideId + "-v" + item.version,
        ],
      );
    });
    await audit(
      db,
      "guide.publish.request",
      actor.userId,
      "guide",
      String(guideId),
    );
    return { ok: true, status: "queued" };
  });
}
