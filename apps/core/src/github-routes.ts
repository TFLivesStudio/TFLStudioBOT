import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";

const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const fail = (message: string, statusCode = 404) =>
  Object.assign(new Error(message), { statusCode });
export async function registerGitHubReadRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.get("/api/v1/github/releases", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({ repository: repository.optional() })
      .parse(req.query);
    const result = await db.query(
      "SELECT r.*,p.publication_status,p.discord_message_id,p.discord_thread_id," +
        "(SELECT count(*)::int FROM github_release_commits c WHERE c.repository=r.repository AND c.release_id=r.release_id) AS verified_commits " +
        "FROM github_release_records r LEFT JOIN reports p ON p.id=r.report_id " +
        "WHERE ($1::text IS NULL OR r.repository=$1) ORDER BY r.published_at DESC NULLS LAST,r.release_id DESC LIMIT $2 OFFSET $3",
      [q.repository ?? null, q.limit, q.offset],
    );
    return { items: result.rows, ...q, completeness: "verified_refs_only" };
  });
  app.get("/api/v1/github/releases/:id/commits", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const params = z
      .object({ id: z.coerce.number().int().positive() })
      .parse(req.params);
    const q = page.extend({ repository }).parse(req.query);
    const release = await db.query(
      "SELECT repository,release_id,tag,relation_status,change_state,resolved_commit_sha,previous_release_id " +
        "FROM github_release_records WHERE repository=$1 AND release_id=$2",
      [q.repository, params.id],
    );
    if (!release.rows[0]) throw fail("Release not found");
    const results = await db.query(
      "SELECT c.sha,cr.report_id AS development_report_id,gr.reported_at,pr.publication_status " +
        "FROM github_release_commits c " +
        "LEFT JOIN github_report_commits cr ON cr.repository=c.repository AND cr.sha=c.sha " +
        "LEFT JOIN github_commits gr ON gr.repository=c.repository AND gr.sha=c.sha " +
        "LEFT JOIN reports pr ON pr.id=cr.report_id " +
        "WHERE c.repository=$1 AND c.release_id=$2 " +
        "ORDER BY c.sha LIMIT $3 OFFSET $4",
      [q.repository, params.id, q.limit, q.offset],
    );
    return {
      release: release.rows[0],
      items: results.rows,
      limit: q.limit,
      offset: q.offset,
      note: "SHA associations from verified tag comparison; matching release/dev reports are retained, never guessed from text",
    };
  });
  app.get("/api/v1/github/commits", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        repository,
        state: z
          .enum([
            "detected",
            "assigned",
            "published",
            "needs_reconciliation",
            "cancelled",
            "legacy_unverified",
          ])
          .optional(),
      })
      .parse(req.query);
    const result = await db.query(
      "SELECT c.sha,c.author,c.title,c.url,c.committed_at,c.reported_at,x.report_id,r.publication_status," +
        "CASE WHEN c.reported_at IS NOT NULL AND x.report_id IS NULL THEN 'legacy_unverified' " +
        "WHEN x.report_id IS NULL THEN 'detected' " +
        "WHEN r.publication_status='published' AND r.discord_message_id IS NOT NULL THEN 'published' " +
        "WHEN r.publication_status='needs_reconciliation' THEN 'needs_reconciliation' " +
        "WHEN r.publication_status='cancelled' THEN 'cancelled' ELSE 'assigned' END AS lifecycle " +
        "FROM github_commits c " +
        "LEFT JOIN github_report_commits x ON x.repository=c.repository AND x.sha=c.sha " +
        "LEFT JOIN reports r ON r.id=x.report_id " +
        "WHERE c.repository=$1 AND ($2::text IS NULL OR " +
        "(CASE WHEN c.reported_at IS NOT NULL AND x.report_id IS NULL THEN 'legacy_unverified' " +
        "WHEN x.report_id IS NULL THEN 'detected' " +
        "WHEN r.publication_status='published' AND r.discord_message_id IS NOT NULL THEN 'published' " +
        "WHEN r.publication_status='needs_reconciliation' THEN 'needs_reconciliation' " +
        "WHEN r.publication_status='cancelled' THEN 'cancelled' ELSE 'assigned' END)=$2) " +
        "ORDER BY c.committed_at DESC,c.sha LIMIT $3 OFFSET $4",
      [q.repository, q.state ?? null, q.limit, q.offset],
    );
    return { items: result.rows, ...q, completeness: "stored_commits_only" };
  });
}
