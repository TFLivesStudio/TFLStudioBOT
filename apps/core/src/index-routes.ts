import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { transaction } from "./db.js";
import { recoverOrphanedImports } from "./report-import.js";
import { DEPARTMENTS } from "./ids.js";

const number = z.coerce.number().int().positive();
const pager = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export async function registerIndexRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.get("/api/v1/report-index/sources", async (req) => {
    await requireUser(req, db, config, { admin: true });
    return {
      items: (
        await db.query("SELECT * FROM report_index_sources ORDER BY department")
      ).rows,
    };
  });
  app.patch("/api/v1/report-index/sources/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id } = z.object({ id: number }).parse(req.params);
    const data = z
      .object({
        enabled: z.boolean(),
        captureContent: z.boolean(),
        historicalEnabled: z.boolean(),
      })
      .parse(req.body);
    if (data.captureContent && !config.INDEX_MESSAGE_CONTENT_INTENT)
      throw Object.assign(
        new Error("Privileged content intent is not enabled"),
        { statusCode: 409 },
      );
    const source = await db.query<{ department: string; channel_id: string }>(
      "SELECT department,channel_id FROM report_index_sources WHERE id=$1",
      [id],
    );
    const row = source.rows[0];
    if (
      !row ||
      !(row.department in DEPARTMENTS) ||
      DEPARTMENTS[row.department as keyof typeof DEPARTMENTS].destination !==
        row.channel_id
    )
      throw Object.assign(
        new Error("Source not approved in audited inventory"),
        { statusCode: 409 },
      );
    await db.query(
      "UPDATE report_index_sources SET enabled=$2,capture_content=$3,historical_enabled=$4,updated_at=now() WHERE id=$1",
      [id, data.enabled, data.captureContent, data.historicalEnabled],
    );
    await audit(
      db,
      "report_index.source.configure",
      actor.userId,
      "report_index_source",
      String(id),
      data,
    );
    return { ok: true };
  });

  app.get("/api/v1/report-index/coverage", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const result = await db.query(
      "SELECT s.id,s.department,s.channel_id,s.enabled,s.capture_content,s.historical_enabled," +
        "(SELECT count(*)::int FROM reports r WHERE r.discord_channel_id=s.channel_id) AS indexed_reports," +
        "(SELECT count(*)::int FROM reports r WHERE r.discord_channel_id=s.channel_id AND r.content_state<>'available') AS unavailable_bodies," +
        "(SELECT max(r.indexed_at) FROM reports r WHERE r.discord_channel_id=s.channel_id) AS last_indexed_at," +
        "(SELECT jsonb_build_object('status',i.status,'processed',i.processed,'inserted',i.inserted,'errors',i.errors,'dryRun',i.dry_run,'phase',i.phase) " +
        "FROM report_import_runs i WHERE i.source_id=s.id ORDER BY i.id DESC LIMIT 1) AS last_import " +
        "FROM report_index_sources s ORDER BY s.department",
    );
    return {
      items: result.rows,
      coverage: "observed_only_or_partial",
      note: "Stored counts are not verified totals of the Discord server",
    };
  });
  app.get("/api/v1/report-index/imports", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = pager.parse(req.query);
    return {
      items: (
        await db.query(
          "SELECT * FROM report_import_runs ORDER BY id DESC LIMIT $1 OFFSET $2",
          [q.limit, q.offset],
        )
      ).rows,
      ...q,
    };
  });
  app.get("/api/v1/report-index/imports/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const id = z.object({ id: number }).parse(req.params).id;
    const rows = await db.query(
      "SELECT * FROM report_import_runs WHERE id=$1",
      [id],
    );
    if (!rows.rowCount)
      throw Object.assign(new Error("Import not found"), { statusCode: 404 });
    return { item: rows.rows[0] };
  });
  app.post("/api/v1/report-index/imports", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const data = z
      .object({ sourceId: number, dryRun: z.boolean().default(true) })
      .parse(req.body);
    const source = await db.query<{
      enabled: boolean;
      historical_enabled: boolean;
    }>(
      "SELECT enabled,historical_enabled FROM report_index_sources WHERE id=$1",
      [data.sourceId],
    );
    if (!source.rows[0]?.enabled || !source.rows[0]?.historical_enabled)
      throw Object.assign(new Error("Historical index source is not enabled"), {
        statusCode: 409,
      });
    const id = await transaction(db, async (c) => {
      const check = await c.query(
        "SELECT id FROM report_import_runs WHERE source_id=$1 AND status IN ('queued','running','paused') LIMIT 1 FOR UPDATE",
        [data.sourceId],
      );
      if (check.rowCount)
        throw Object.assign(
          new Error("Existing import must finish or be cancelled"),
          { statusCode: 409 },
        );
      const created = await c.query<{ id: string }>(
        "INSERT INTO report_import_runs(source_id,dry_run,started_by) VALUES($1,$2,$3) RETURNING id",
        [data.sourceId, data.dryRun, actor.userId],
      );
      const runId = created.rows[0]!.id;
      await c.query(
        "INSERT INTO automation_jobs(kind,payload,dedup_key,origin) VALUES('history_import',$1,$2,'admin')",
        [JSON.stringify({ runId }), "import:first:" + runId],
      );
      return runId;
    });
    await audit(db, "report_index.import.start", actor.userId, "import", id, {
      dryRun: data.dryRun,
    });
    return { id, status: "queued", dryRun: data.dryRun };
  });
  app.post("/api/v1/report-index/imports/:id/resume", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const id = z.object({ id: number }).parse(req.params).id;
    await transaction(db, async (c) => {
      const updated = await c.query(
        "UPDATE report_import_runs SET status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=now() " +
          "WHERE id=$1 AND status IN ('paused','failed') RETURNING id",
        [id],
      );
      if (!updated.rowCount)
        throw Object.assign(new Error("Import cannot be resumed"), {
          statusCode: 409,
        });
      await c.query(
        "INSERT INTO automation_jobs(kind,payload,origin) VALUES('history_import',$1,'admin')",
        [JSON.stringify({ runId: String(id) })],
      );
    });
    await audit(
      db,
      "report_index.import.resume",
      actor.userId,
      "import",
      String(id),
    );
    return { ok: true };
  });
  app.post("/api/v1/report-index/imports/:id/pause", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const id = z.object({ id: number }).parse(req.params).id;
    const result = await db.query(
      "UPDATE report_import_runs SET status='paused',lease_token=NULL,lease_expires_at=NULL," +
        "last_error='Paused by ADMIN',updated_at=now() WHERE id=$1 AND status IN ('queued','running') RETURNING id",
      [id],
    );
    if (!result.rowCount)
      throw Object.assign(new Error("Import not pausable"), {
        statusCode: 409,
      });
    await audit(
      db,
      "report_index.import.pause",
      actor.userId,
      "import",
      String(id),
    );
    return { ok: true };
  });
  app.post("/api/v1/report-index/imports/recover", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const result = await recoverOrphanedImports(db);
    await audit(
      db,
      "report_index.import.recover",
      actor.userId,
      "import",
      "all",
      result,
    );
    return result;
  });
  app.post("/api/v1/report-index/imports/:id/cancel", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const id = z.object({ id: number }).parse(req.params).id;
    const result = await db.query(
      "UPDATE report_import_runs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now(),finished_at=now() WHERE id=$1 AND status IN ('queued','running','paused') RETURNING id",
      [id],
    );
    if (!result.rowCount)
      throw Object.assign(new Error("Import not cancellable"), {
        statusCode: 409,
      });
    await audit(
      db,
      "report_index.import.cancel",
      actor.userId,
      "import",
      String(id),
    );
    return {
      ok: true,
      note: "Cancellation takes effect at the next batch boundary",
    };
  });
}
