import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Client } from "discord.js";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { requireUser } from "./auth.js";
import { visibleDepartments } from "./permissions.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { listReportRows, reportQuerySchema } from "./report-query.js";

const date = z.string().datetime();
export async function registerObservabilityRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
  discord: Client,
): Promise<void> {
  app.get("/api/v1/stats", async (req) => {
    const actor = await requireUser(req, db, config);
    const allowed = await visibleDepartments(config, actor);
    const q = z
      .object({ from: date.optional(), to: date.optional() })
      .parse(req.query);
    const params = [allowed, q.from ?? null, q.to ?? null];
    const where =
      "WHERE department=ANY($1::text[]) AND ($2::timestamptz IS NULL OR occurred_at >=$2) " +
      "AND ($3::timestamptz IS NULL OR occurred_at <=$3)";
    const [departments, sources, projects, quality, period] = await Promise.all(
      [
        db.query(
          "SELECT department,count(*)::int total FROM reports " +
            where +
            " GROUP BY department ORDER BY total DESC",
          params,
        ),
        db.query(
          "SELECT source,count(*)::int total FROM reports " +
            where +
            " GROUP BY source ORDER BY total DESC",
          params,
        ),
        db.query(
          "SELECT project,count(*)::int total FROM reports " +
            where +
            " GROUP BY project ORDER BY total DESC",
          params,
        ),
        db.query(
          "SELECT content_state,sync_state,publication_status,count(*)::int total FROM reports " +
            where +
            " GROUP BY content_state,sync_state,publication_status",
          params,
        ),
        db.query(
          "SELECT date_trunc('day',occurred_at)::date AS day,count(*)::int total FROM reports " +
            where +
            " GROUP BY 1 ORDER BY 1",
          params,
        ),
      ],
    );
    return {
      departments: departments.rows,
      sources: sources.rows,
      projects: projects.rows,
      quality: quality.rows,
      period: period.rows,
      scope: {
        departments: allowed,
        from: q.from ?? null,
        to: q.to ?? null,
        basis: "persisted_reports_only",
        coverage: "partial_or_unknown",
        disclaimer: "No equivalen al total histórico de Discord",
      },
    };
  });
  app.get("/api/v1/diagnostics", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const began = performance.now();
    await db.query("SELECT 1");
    const postgresLatencyMs = Math.round((performance.now() - began) * 10) / 10;
    const [jobs, imports, sources, heartbeats, errors] = await Promise.all([
      db.query(
        "SELECT status,count(*)::int total,min(run_at) AS oldest_run_at FROM automation_jobs GROUP BY status ORDER BY status",
      ),
      db.query(
        "SELECT status,count(*)::int total,sum(processed)::text processed,sum(errors)::text errors " +
          "FROM report_import_runs GROUP BY status",
      ),
      db.query(
        "SELECT repository,department,enabled,push_enabled,release_enabled,last_sync_at,last_sync_error,coverage_gap " +
          "FROM github_sources ORDER BY repository",
      ),
      db.query(
        "SELECT component,last_seen_at,state,detail,last_job_at, " +
          "(last_seen_at>=now()-interval '60 seconds') AS fresh FROM worker_heartbeats ORDER BY component",
      ),
      db.query(
        "SELECT id,kind,status,attempts,left(last_error,200) AS last_error,updated_at " +
          "FROM automation_jobs WHERE status IN ('failed','needs_reconciliation') ORDER BY updated_at DESC LIMIT 30",
      ),
    ]);
    return {
      gateway: {
        ready: discord.isReady(),
        status: discord.isReady() ? "connected" : "disconnected",
      },
      postgresql: { reachable: true, latencyMs: postgresLatencyMs },
      runtime: {
        bun:
          (process.versions as Record<string, string | undefined>).bun ?? null,
        nodeCompatibility: process.versions.node,
        memoryRssBytes: process.memoryUsage().rss,
        uptimeSeconds: Math.round(process.uptime()),
      },
      jobs: jobs.rows,
      imports: imports.rows,
      github: sources.rows,
      heartbeats: heartbeats.rows,
      recentErrors: errors.rows,
      scope: "admin_only",
      basis: "database_observations",
      note: "A missing or stale worker heartbeat means worker availability is unknown",
    };
  });
  app.get("/api/v1/jobs/metrics", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const results = await db.query(
      "SELECT kind,status,count(*)::int total,max(updated_at) AS latest_at " +
        "FROM automation_jobs GROUP BY kind,status ORDER BY kind,status",
    );
    return { items: results.rows, basis: "persisted_jobs" };
  });
  app.get("/api/v1/reports/export", async (req, reply) => {
    await requireUser(req, db, config, { admin: true });
    const q = reportQuerySchema
      .extend({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        format: z.enum(["json", "csv"]).default("json"),
      })
      .parse(req.query);
    const selected = q.department
      ? [q.department]
      : (Object.keys(DEPARTMENTS) as DepartmentKey[]);
    const result = await listReportRows(db, selected, q);
    reply.header("Cache-Control", "private, no-store");
    if (q.format === "json")
      return {
        items: result.rows,
        limit: q.limit,
        offset: q.offset,
        basis: "stored_records_only",
      };
    const columns = [
      "id",
      "department",
      "project",
      "source",
      "title",
      "description",
      "created_by",
      "author_id",
      "discord_channel_id",
      "discord_message_id",
      "discord_thread_id",
      "publication_status",
      "sync_state",
      "content_state",
      "occurred_at",
      "updated_at",
    ];
    const escape = (value: unknown): string => {
      let output = value == null ? "" : String(value);
      if (/^[=+\-@\t\r]/.test(output)) output = "'" + output; // prevent spreadsheet formula injection
      return '"' + output.replaceAll('"', '""') + '"';
    };
    const csv = [
      columns.join(","),
      ...result.rows.map((row) =>
        columns
          .map((key) => escape((row as Record<string, unknown>)[key]))
          .join(","),
      ),
    ].join("\r\n");
    reply.header(
      "Content-Disposition",
      'attachment; filename="tfl-studio-reportes.csv"',
    );
    return reply.type("text/csv; charset=utf-8").send(csv);
  });
}
