import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { compareSnapshots, type AuditSnapshot } from "./auditor.js";

const param = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export async function registerAuditorRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.post("/api/v1/auditor/snapshots", async (req) => {
    const user = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const options = z
      .object({
        includeArchived: z.boolean().default(false),
        maxArchivedPerForum: z.number().int().min(10).max(500).default(100),
      })
      .parse(req.body ?? {});
    const result = await transaction(db, async (client) => {
      const created = await client.query<{ id: string }>(
        "INSERT INTO audit_snapshots(requested_by,options) VALUES($1,$2) RETURNING id",
        [user.userId, JSON.stringify(options)],
      );
      const id = created.rows[0]!.id;
      await client.query(
        "INSERT INTO automation_jobs(kind,payload,origin,correlation) VALUES('auditor_snapshot',$1,'admin',$2)",
        [JSON.stringify({ snapshotId: id }), "audit_snapshot:" + id],
      );
      return { id, status: "queued" };
    });
    await audit(
      db,
      "auditor.snapshot.request",
      user.userId,
      "audit_snapshot",
      result.id,
      options,
    );
    return result;
  });
  app.get("/api/v1/auditor/snapshots", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page.parse(req.query);
    return {
      items: (
        await db.query(
          "SELECT id,requested_by,status,options,completeness,error,created_at,finished_at FROM audit_snapshots ORDER BY id DESC LIMIT $1 OFFSET $2",
          [q.limit, q.offset],
        )
      ).rows,
      ...q,
    };
  });
  app.get("/api/v1/auditor/snapshots/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id } = param.parse(req.params);
    const result = await db.query(
      "SELECT id,requested_by,status,options,completeness,error,created_at,finished_at,snapshot->'totals' AS totals,snapshot->'sections' AS sections FROM audit_snapshots WHERE id=$1",
      [id],
    );
    if (!result.rowCount)
      throw Object.assign(new Error("Snapshot not found"), { statusCode: 404 });
    return { item: result.rows[0] };
  });
  app.get("/api/v1/auditor/snapshots/:id/download", async (req, reply) => {
    await requireUser(req, db, config, { admin: true });
    const { id } = param.parse(req.params);
    const { format } = z
      .object({ format: z.enum(["json", "md"]).default("json") })
      .parse(req.query);
    const result = await db.query<{
      snapshot: AuditSnapshot | null;
      markdown: string | null;
      status: string;
    }>("SELECT snapshot,markdown,status FROM audit_snapshots WHERE id=$1", [
      id,
    ]);
    const record = result.rows[0];
    if (!record)
      throw Object.assign(new Error("Snapshot not found"), { statusCode: 404 });
    if (record.status !== "done" || !record.snapshot || !record.markdown)
      throw Object.assign(new Error("Snapshot not available"), {
        statusCode: 409,
      });
    reply.header(
      "Content-Disposition",
      'attachment; filename="tfl-studio-audit-' +
        id +
        (format === "json" ? ".json" : ".md") +
        '"',
    );
    reply.header("Cache-Control", "private, no-store");
    return format === "json"
      ? reply.type("application/json").send(record.snapshot)
      : reply.type("text/markdown; charset=utf-8").send(record.markdown);
  });
  app.get("/api/v1/auditor/snapshots/:id/compare", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id } = param.parse(req.params);
    const { against } = z
      .object({ against: z.coerce.number().int().positive() })
      .parse(req.query);
    const result = await db.query<{ id: string; snapshot: AuditSnapshot }>(
      "SELECT id,snapshot FROM audit_snapshots WHERE id=ANY($1::bigint[]) AND status='done'",
      [[id, against]],
    );
    const first = result.rows.find((x) => x.id === String(id))?.snapshot;
    const second = result.rows.find((x) => x.id === String(against))?.snapshot;
    if (!first || !second)
      throw Object.assign(new Error("Both snapshots must be available"), {
        statusCode: 404,
      });
    return compareSnapshots(first, second);
  });
}
