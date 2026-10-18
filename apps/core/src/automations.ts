import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { pollGithubCommits, fetchGithubRepository } from "./github.js";
import { allocateGithubBatch } from "./github-batches.js";

const type = z.enum([
  "github_sync",
  "github_releases_sync",
  "github_push_summary",
  "announcement",
  "report_watch",
  "admin_notice",
  "maintenance",
]);
export type AutomationKind = z.infer<typeof type>;
const trigger = z.enum(["manual", "interval"]);
const repo = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const department = z.enum(
  Object.keys(DEPARTMENTS) as [DepartmentKey, ...DepartmentKey[]],
);
const metadata = z.object({
  name: z.string().trim().min(3).max(90),
  description: z.string().max(500).default(""),
  kind: type,
  triggerKind: trigger,
  intervalMinutes: z.number().int().min(5).max(1440).nullable().default(null),
  config: z.unknown(),
});
const id = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
export function validateAutomation(
  kind: AutomationKind,
  config: unknown,
): Record<string, unknown> {
  switch (kind) {
    case "github_sync":
    case "github_releases_sync":
    case "github_push_summary":
      return z.object({ repository: repo }).strict().parse(config);
    case "announcement":
      return z
        .object({ announcementId: z.number().int().positive() })
        .strict()
        .parse(config);
    case "report_watch":
      return z
        .object({
          department,
          threshold: z.number().int().positive().max(100000),
          windowMinutes: z.number().int().min(5).max(1440),
        })
        .strict()
        .parse(config);
    case "admin_notice":
      return z
        .object({ message: z.string().trim().min(5).max(500) })
        .strict()
        .parse(config);
    case "maintenance":
      return z
        .object({ operation: z.literal("prune_expired_sessions") })
        .strict()
        .parse(config);
  }
}
type Definition = {
  id: string;
  kind: AutomationKind;
  config: Record<string, unknown>;
  enabled: boolean;
  trigger_kind: string;
  interval_minutes: number | null;
  version: number;
  next_run_at: Date | null;
};
export async function scheduleDueAutomations(db: DB): Promise<number> {
  return transaction(db, async (c) => {
    const due = await c.query<Definition>(
      "SELECT id,kind,config,enabled,trigger_kind,interval_minutes,version,next_run_at " +
        "FROM automation_definitions WHERE enabled AND trigger_kind='interval' AND next_run_at<=now() " +
        "ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 20",
    );
    for (const rule of due.rows) {
      const occurrence = rule.next_run_at?.toISOString();
      if (!occurrence || !rule.interval_minutes) continue;
      await c.query(
        "INSERT INTO automation_jobs(kind,payload,dedup_key,origin,automation_id,correlation) " +
          "VALUES('automation_rule',$1,$2,'scheduled',$3,$4) ON CONFLICT(dedup_key) DO NOTHING",
        [
          JSON.stringify({ ruleId: rule.id, version: rule.version }),
          "automation:" + rule.id + ":" + occurrence,
          rule.id,
          "automation:" + rule.id,
        ],
      );
      await c.query(
        "UPDATE automation_definitions SET next_run_at=now()+($2::int*interval '1 minute'),updated_at=now() WHERE id=$1",
        [rule.id, rule.interval_minutes],
      );
    }
    return due.rowCount ?? 0;
  });
}
export async function executeConfiguredAutomation(
  db: DB,
  config: Config | undefined,
  jobId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const ruleId = String(payload.ruleId ?? "");
  const result = await db.query<Definition>(
    "SELECT id,kind,config,enabled,trigger_kind,interval_minutes,version,next_run_at FROM automation_definitions WHERE id=$1",
    [ruleId],
  );
  const rule = result.rows[0];
  if (!rule) return "missing";
  if (!rule.enabled) return "disabled";
  if (rule.version !== Number(payload.version)) return "stale_configuration";
  const options = validateAutomation(rule.kind, rule.config);
  let status = "completed";
  switch (rule.kind) {
    case "github_sync":
    case "github_releases_sync":
    case "github_push_summary": {
      if (!config) throw new Error("GitHub automation requires configuration");
      const repository = String(options.repository);
      const src = await db.query<{
        enabled: boolean;
        department: DepartmentKey;
        push_enabled: boolean;
        release_enabled: boolean;
      }>(
        "SELECT enabled,department,push_enabled,release_enabled FROM github_sources WHERE repository=$1",
        [repository],
      );
      const source = src.rows[0];
      if (!source?.enabled) throw new Error("GitHub source is disabled");
      if (rule.kind === "github_sync") {
        if (!source.push_enabled) throw new Error("GitHub push flow disabled");
        const count = await pollGithubCommits(db, config, repository);
        status = "commit_sync:" + count;
      } else if (rule.kind === "github_releases_sync") {
        if (!source.release_enabled)
          throw new Error("GitHub release flow disabled");
        const count = await fetchGithubRepository(db, config, repository);
        status = "release_sync:" + count;
      } else {
        if (!source.push_enabled) throw new Error("GitHub push flow disabled");
        const batch = await allocateGithubBatch(
          db,
          repository,
          source.department,
        );
        status = batch
          ? "report_queued:" + batch.reportId
          : "no_pending_commits";
      }
      break;
    }
    case "announcement": {
      const announcementId = Number(options.announcementId);
      const found = await db.query<{
        status: string;
        scheduled_at: Date | null;
      }>("SELECT status,scheduled_at FROM announcements WHERE id=$1", [
        announcementId,
      ]);
      if (found.rows[0]?.status !== "scheduled")
        throw new Error("Announcement must be explicitly scheduled");
      const added = await db.query(
        "INSERT INTO automation_jobs(kind,payload,dedup_key,origin) VALUES('announcement',$1,$2,'automation') " +
          "ON CONFLICT(dedup_key) DO NOTHING RETURNING id",
        [
          JSON.stringify({ id: String(announcementId) }),
          "announcement:" + announcementId,
        ],
      );
      status = added.rowCount
        ? "announcement_queued"
        : "announcement_already_queued";
      break;
    }
    case "report_watch": {
      const dep = String(options.department);
      const threshold = Number(options.threshold);
      const minutes = Number(options.windowMinutes);
      const total = await db.query<{ total: number }>(
        "SELECT count(*)::int total FROM reports WHERE department=$1 AND occurred_at>=now()-($2::int*interval '1 minute') AND publication_status<>'deleted'",
        [dep, minutes],
      );
      const count = total.rows[0]?.total ?? 0;
      if (count >= threshold) {
        await db.query(
          "INSERT INTO admin_notifications(category,message,source_job_id) VALUES('report_watch',$1,$2) ON CONFLICT(source_job_id,category) DO NOTHING",
          [
            "Report watch: " +
              count +
              " stored reports in " +
              dep +
              " during the last " +
              minutes +
              " minutes.",
            jobId,
          ],
        );
        status = "threshold_reached:" + count;
      } else status = "below_threshold:" + count;
      break;
    }
    case "admin_notice": {
      await db.query(
        "INSERT INTO admin_notifications(category,message,source_job_id) VALUES('admin_notice',$1,$2) ON CONFLICT(source_job_id,category) DO NOTHING",
        [String(options.message), jobId],
      );
      break;
    }
    case "maintenance": {
      if (options.operation !== "prune_expired_sessions")
        throw new Error("Unsupported maintenance task");
      const result = await db.query(
        "DELETE FROM sessions WHERE expires_at<now()",
      );
      status = "expired_sessions_pruned:" + (result.rowCount ?? 0);
      break;
    }
  }
  await db.query(
    "UPDATE automation_definitions SET last_run_at=now(),last_result=$2,last_error=NULL WHERE id=$1",
    [rule.id, status],
  );
  return status;
}
export async function registerAutomationRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.get("/api/v1/automations", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        enabled: z
          .enum(["true", "false"])
          .transform((v) => v === "true")
          .optional(),
        kind: type.optional(),
      })
      .parse(req.query);
    const result = await db.query(
      "SELECT * FROM automation_definitions WHERE ($1::boolean IS NULL OR enabled=$1) " +
        "AND ($2::text IS NULL OR kind=$2) ORDER BY id DESC LIMIT $3 OFFSET $4",
      [q.enabled ?? null, q.kind ?? null, q.limit, q.offset],
    );
    return { items: result.rows, ...q };
  });
  app.get("/api/v1/automations/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: ruleId } = id.parse(req.params);
    const result = await db.query(
      "SELECT * FROM automation_definitions WHERE id=$1",
      [ruleId],
    );
    if (!result.rows[0]) throw fail("Automation not found", 404);
    return { item: result.rows[0] };
  });
  app.post("/api/v1/automations", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const data = metadata.parse(req.body);
    if ((data.triggerKind === "interval") !== (data.intervalMinutes !== null))
      throw fail("Interval trigger requires intervalMinutes", 400);
    const settings = validateAutomation(data.kind, data.config);
    const result = await db.query<{ id: string }>(
      "INSERT INTO automation_definitions(name,description,kind,trigger_kind,interval_minutes,config,created_by,updated_by) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id",
      [
        data.name,
        data.description,
        data.kind,
        data.triggerKind,
        data.intervalMinutes,
        JSON.stringify(settings),
        actor.userId,
      ],
    );
    await audit(
      db,
      "automation.create",
      actor.userId,
      "automation",
      result.rows[0]!.id,
    );
    return { id: result.rows[0]!.id, enabled: false };
  });
  app.patch("/api/v1/automations/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: ruleId } = id.parse(req.params);
    const data = metadata
      .extend({ expectedVersion: z.number().int().positive() })
      .parse(req.body);
    if ((data.triggerKind === "interval") !== (data.intervalMinutes !== null))
      throw fail("Interval trigger requires intervalMinutes", 400);
    const settings = validateAutomation(data.kind, data.config);
    const result = await db.query<{ version: number }>(
      "UPDATE automation_definitions SET name=$3,description=$4,kind=$5,trigger_kind=$6,interval_minutes=$7,config=$8," +
        "version=version+1,updated_by=$9,updated_at=now() WHERE id=$1 AND version=$2 AND NOT enabled RETURNING version",
      [
        ruleId,
        data.expectedVersion,
        data.name,
        data.description,
        data.kind,
        data.triggerKind,
        data.intervalMinutes,
        JSON.stringify(settings),
        actor.userId,
      ],
    );
    if (!result.rows[0])
      throw fail("Disable automation before editing or refresh version");
    await audit(
      db,
      "automation.edit",
      actor.userId,
      "automation",
      String(ruleId),
    );
    return { ok: true, version: result.rows[0].version };
  });
  app.post("/api/v1/automations/:id/enable", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: ruleId } = id.parse(req.params);
    const data = z
      .object({
        expectedVersion: z.number().int().positive(),
        enabled: z.boolean(),
      })
      .parse(req.body);
    const result = await db.query<{ version: number }>(
      "UPDATE automation_definitions SET enabled=$3,next_run_at=CASE WHEN $3 AND trigger_kind='interval' " +
        "THEN now()+(interval_minutes*interval '1 minute') ELSE NULL END,version=version+1,updated_by=$4,updated_at=now() " +
        "WHERE id=$1 AND version=$2 RETURNING version",
      [ruleId, data.expectedVersion, data.enabled, actor.userId],
    );
    if (!result.rows[0]) throw fail("Automation version conflict or missing");
    await audit(
      db,
      data.enabled ? "automation.enable" : "automation.disable",
      actor.userId,
      "automation",
      String(ruleId),
    );
    return { ok: true, enabled: data.enabled, version: result.rows[0].version };
  });
  app.post("/api/v1/automations/:id/run", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: ruleId } = id.parse(req.params);
    z.object({ confirm: z.literal(true) }).parse(req.body);
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(key))
      throw fail("Idempotency-Key required", 400);
    const src = await db.query<{ version: number; enabled: boolean }>(
      "SELECT version,enabled FROM automation_definitions WHERE id=$1",
      [ruleId],
    );
    if (!src.rows[0]?.enabled)
      throw fail("Automation must be explicitly enabled");
    const job = await db.query<{ id: string }>(
      "INSERT INTO automation_jobs(kind,payload,dedup_key,origin,automation_id) " +
        "VALUES('automation_rule',$1,$2,'admin',$3) ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=EXCLUDED.dedup_key RETURNING id",
      [
        JSON.stringify({
          ruleId: String(ruleId),
          version: src.rows[0].version,
        }),
        "automation:manual:" + ruleId + ":" + key,
        ruleId,
      ],
    );
    await audit(
      db,
      "automation.run",
      actor.userId,
      "automation",
      String(ruleId),
      { jobId: job.rows[0]!.id },
    );
    return { jobId: job.rows[0]!.id, status: "queued_or_existing" };
  });
  app.get("/api/v1/automations/:id/executions", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: ruleId } = id.parse(req.params);
    const q = page.parse(req.query);
    const result = await db.query(
      "SELECT id,status,run_at,attempts,last_error,created_at,completed_at FROM automation_jobs " +
        "WHERE automation_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [ruleId, q.limit, q.offset],
    );
    return { items: result.rows, ...q };
  });
  app.get("/api/v1/automations/notifications", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page.parse(req.query);
    const result = await db.query(
      "SELECT * FROM admin_notifications ORDER BY id DESC LIMIT $1 OFFSET $2",
      [q.limit, q.offset],
    );
    return { items: result.rows, ...q };
  });
  app.post("/api/v1/automations/notifications/:id/acknowledge", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: noteId } = id.parse(req.params);
    const changed = await db.query(
      "UPDATE admin_notifications SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=$1 RETURNING id",
      [noteId],
    );
    if (!changed.rowCount) throw fail("Notification not found", 404);
    await audit(
      db,
      "notification.ack",
      actor.userId,
      "admin_notification",
      String(noteId),
    );
    return { ok: true };
  });
}
