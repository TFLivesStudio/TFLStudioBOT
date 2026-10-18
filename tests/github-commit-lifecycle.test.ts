import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Client } from "discord.js";
import {
  allocateGithubBatch,
  confirmGithubPublication,
  releaseCancelledBatch,
} from "../apps/core/src/github-batches.js";
import { runOneJob } from "../apps/core/src/jobs.js";
import { transaction } from "../apps/core/src/db.js";

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(
  url?.includes("studio_test") && process.env.NODE_ENV === "test",
);
const sha = (n: number) => n.toString(16).padStart(40, "0");
test(
  "PostgreSQL: commit allocation, confirmation and reconciliation",
  { skip: !enabled },
  async (t) => {
    const db = new pg.Pool({ connectionString: url!, max: 12 });
    const repo = "CI/sha-lifecycle-" + randomUUID();
    let sent = 0;
    const discord = {
      channels: {
        fetch: async () => ({
          type: 0,
          send: async () => {
            sent++;
            const messageId = String(900000000000000000n + BigInt(sent));
            return {
              id: messageId,
              url:
                "https://discord.com/channels/1264656310205415474/1559244927345631232/" +
                messageId,
            };
          },
        }),
      },
    } as unknown as Client;
    const put = async (start: number, total: number) => {
      for (let i = start; i < start + total; i++)
        await db.query(
          "INSERT INTO github_commits(repository,sha,author,title,url) VALUES($1,$2,'CI','Fix','https://github.com/example/repo/commit/'||$2)",
          [repo, sha(i)],
        );
    };
    const linked = () =>
      db.query<{ total: string; published: string }>(
        "SELECT count(*)::text total,count(c.reported_at)::text published " +
          "FROM github_report_commits x JOIN github_commits c ON c.repository=x.repository AND c.sha=x.sha WHERE x.repository=$1",
        [repo],
      );
    try {
      await db.query(
        "INSERT INTO github_sources(repository,department,enabled,push_enabled) VALUES($1,'client',true,true)",
        [repo],
      );
      await put(1, 25);
      await t.test(
        "two allocators cannot assign the same SHA; pending remains unreported",
        async () => {
          const batches = await Promise.all([
            allocateGithubBatch(db, repo, "client"),
            allocateGithubBatch(db, repo, "client"),
          ]);
          assert.ok(batches.some(Boolean));
          const count = await linked();
          assert.equal(Number(count.rows[0]?.total), 25);
          assert.equal(Number(count.rows[0]?.published), 0);
          const totals = await db.query<{ unassigned: string }>(
            "SELECT count(*)::text unassigned FROM github_commits c WHERE c.repository=$1 " +
              "AND NOT EXISTS(SELECT 1 FROM github_report_commits x WHERE x.repository=c.repository AND x.sha=c.sha)",
            [repo],
          );
          assert.equal(Number(totals.rows[0]?.unassigned), 0);
          const noDuplicate = await db.query(
            "SELECT sha,count(*) FROM github_report_commits WHERE repository=$1 GROUP BY sha HAVING count(*)>1",
            [repo],
          );
          assert.equal(noDuplicate.rowCount, 0);
        },
      );
      await t.test(
        "commit reports remain pending until remote confirmation",
        async () => {
          const pending = await linked();
          assert.equal(Number(pending.rows[0]?.published), 0);
          const remaining = await db.query(
            "SELECT count(*)::int total FROM reports WHERE project=$1 AND publication_status='queued'",
            [repo],
          );
          for (let i = 0; i < Number(remaining.rows[0].total); i++)
            assert.equal(await runOneJob(db, discord), true);
          const final = await linked();
          assert.equal(Number(final.rows[0]?.published), 25);
          assert.equal(sent, Number(remaining.rows[0].total));
        },
      );
      await t.test(
        "SQL failure after remote send retains SHA links and reconciles after proof",
        async () => {
          await put(26, 1);
          const batch = await allocateGithubBatch(db, repo, "client");
          assert.ok(batch);
          const broken = {
            query: (sql: string, args?: unknown[]) => db.query(sql, args),
            connect: async () => {
              const c = await db.connect();
              return {
                query: async (sql: string, args?: unknown[]) => {
                  if (sql.startsWith("UPDATE reports SET discord_message_id"))
                    throw new Error("Forced SQL failure after Discord write");
                  return c.query(sql, args);
                },
                release: () => c.release(),
              };
            },
          } as unknown as typeof db;
          assert.equal(await runOneJob(broken, discord), true);
          const r = await db.query(
            "SELECT publication_status FROM reports WHERE id=$1",
            [batch!.reportId],
          );
          assert.equal(r.rows[0].publication_status, "needs_reconciliation");
          const pending = await db.query(
            "SELECT reported_at FROM github_commits WHERE repository=$1 AND sha=$2",
            [repo, sha(26)],
          );
          assert.equal(pending.rows[0].reported_at, null);
          const job = await db.query(
            "SELECT status FROM automation_jobs WHERE kind='report_publish' AND payload->>'reportId'=$1",
            [batch!.reportId],
          );
          assert.equal(job.rows[0].status, "needs_reconciliation");
          await transaction(db, async (c) => {
            await c.query(
              "UPDATE reports SET publication_status='published',discord_message_id=$2 WHERE id=$1",
              [batch!.reportId, "900000000000000999"],
            );
            await confirmGithubPublication(c, batch!.reportId);
            await c.query(
              "UPDATE automation_jobs SET status='done' WHERE kind='report_publish' AND payload->>'reportId'=$1",
              [batch!.reportId],
            );
          });
          const after = await db.query(
            "SELECT reported_at FROM github_commits WHERE repository=$1 AND sha=$2",
            [repo, sha(26)],
          );
          assert.ok(after.rows[0].reported_at);
        },
      );
      await t.test(
        "cancellation releases unconfirmed linked commits without marking published",
        async () => {
          await put(27, 1);
          const batch = await allocateGithubBatch(db, repo, "client");
          assert.ok(batch);
          await transaction(db, async (c) => {
            await c.query(
              "UPDATE reports SET publication_status='cancelled' WHERE id=$1",
              [batch!.reportId],
            );
            await releaseCancelledBatch(c, batch!.reportId);
            await c.query(
              "UPDATE automation_jobs SET status='cancelled' WHERE kind='report_publish' AND payload->>'reportId'=$1",
              [batch!.reportId],
            );
          });
          const r = await db.query(
            "SELECT c.reported_at,x.report_id FROM github_commits c LEFT JOIN github_report_commits x ON c.sha=x.sha AND c.repository=x.repository WHERE c.repository=$1 AND c.sha=$2",
            [repo, sha(27)],
          );
          assert.equal(r.rows[0].reported_at, null);
          assert.equal(r.rows[0].report_id, null);
        },
      );
    } finally {
      await db.query(
        "DELETE FROM job_attempts WHERE job_id IN (SELECT id FROM automation_jobs WHERE payload->>'repo'=$1 OR payload->>'reportId' IN (SELECT id::text FROM reports WHERE project=$1))",
        [repo],
      );
      await db.query(
        "DELETE FROM automation_jobs WHERE payload->>'repo'=$1 OR payload->>'reportId' IN (SELECT id::text FROM reports WHERE project=$1)",
        [repo],
      );
      await db.query("DELETE FROM github_report_commits WHERE repository=$1", [
        repo,
      ]);
      await db.query("DELETE FROM reports WHERE project=$1", [repo]);
      await db.query("DELETE FROM github_commits WHERE repository=$1", [repo]);
      await db.query("DELETE FROM github_sources WHERE repository=$1", [repo]);
      await db.end();
    }
  },
);
