import { withFetchExtras } from "./helpers/fetch.js";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  runImportBatch,
  recoverOrphanedImports,
} from "../apps/core/src/report-import.js";
import type { Config } from "../apps/core/src/config.js";
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(
  url?.includes("studio_test") && process.env.NODE_ENV === "test",
);
test(
  "PostgreSQL: resumable history scans and safe dry-run",
  { skip: !enabled },
  async (t) => {
    const db = new pg.Pool({ connectionString: url!, max: 8 });
    const channelId = (
      900000000000000000n + BigInt(Math.floor(Math.random() * 100000))
    ).toString();
    const mock = globalThis.fetch;
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      id: (920000000000000000n - BigInt(i)).toString(),
      channel_id: channelId,
      timestamp: "2026-10-12T01:02:03.000Z",
      author: { id: "111111111111111111", bot: false },
      content: "Private text",
      attachments: [],
    }));
    const config = { BOT_TOKEN: "fake-ci" } as Config;
    let pageCalls = 0;
    globalThis.fetch = withFetchExtras(async (url) => {
      const request = String(url);
      if (!request.includes("/channels/" + channelId + "/messages?"))
        throw Error("Unexpected Discord endpoint");
      pageCalls++;
      const params = new URL(request);
      return new Response(
        JSON.stringify(params.searchParams.has("before") ? [] : msgs),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    let runId = "";
    let sourceId = "";
    try {
      const source = await db.query<{ id: string }>(
        "INSERT INTO report_index_sources(channel_id,department,enabled,historical_enabled,capture_content) " +
          "VALUES($1,'hosting',true,true,false) RETURNING id",
        [channelId],
      );
      sourceId = source.rows[0]!.id;
      const run = await db.query<{ id: string }>(
        "INSERT INTO report_import_runs(source_id,dry_run,started_by) VALUES($1,true,'111111111111111111') RETURNING id",
        [sourceId],
      );
      runId = run.rows[0]!.id;
      await t.test(
        "checkpoint and continuation job persist in the same batch",
        async () => {
          assert.equal(await runImportBatch(db, config, runId), "more");
          const r = await db.query(
            "SELECT status,cursor,processed,checkpoint_at,lease_token FROM report_import_runs WHERE id=$1",
            [runId],
          );
          assert.equal(r.rows[0].status, "queued");
          assert.equal(Number(r.rows[0].processed), 20);
          assert.equal(r.rows[0].cursor, msgs.at(-1)!.id);
          assert.ok(r.rows[0].checkpoint_at);
          assert.equal(r.rows[0].lease_token, null);
          const next = await db.query(
            "SELECT id FROM automation_jobs WHERE kind='history_import' AND status='queued' AND payload->>'runId'=$1",
            [runId],
          );
          assert.equal(next.rowCount, 1);
          const stored = await db.query(
            "SELECT count(*)::int total FROM reports WHERE discord_channel_id=$1",
            [channelId],
          );
          assert.equal(
            stored.rows[0].total,
            0,
            "dry-run must not insert definitive reports",
          );
        },
      );
      await t.test(
        "second batch resumes exactly at checkpoint and completes",
        async () => {
          assert.equal(await runImportBatch(db, config, runId), "done");
          const r = await db.query(
            "SELECT status,processed,coverage FROM report_import_runs WHERE id=$1",
            [runId],
          );
          assert.equal(r.rows[0].status, "done");
          assert.equal(Number(r.rows[0].processed), 20);
          assert.equal(r.rows[0].coverage, "complete");
          assert.equal(pageCalls, 2);
        },
      );
      await t.test(
        "abandoned lease becomes a recoverable queued import",
        async () => {
          const renewed = await db.query<{ id: string }>(
            "INSERT INTO report_import_runs(source_id,dry_run,started_by) VALUES($1,true,'111111111111111111') RETURNING id",
            [sourceId],
          );
          const second = renewed.rows[0]!.id;
          await db.query(
            "UPDATE report_import_runs SET status='running',lease_token=$2,lease_expires_at=now()-interval '1 hour' WHERE id=$1",
            [second, randomUUID()],
          );
          const recovered = await recoverOrphanedImports(db);
          assert.ok(recovered.recovered >= 1);
          const state = await db.query(
            "SELECT status,lease_token FROM report_import_runs WHERE id=$1",
            [second],
          );
          assert.equal(state.rows[0].status, "queued");
          assert.equal(state.rows[0].lease_token, null);
          const queued = await db.query(
            "SELECT id FROM automation_jobs WHERE kind='history_import' AND status='queued' AND payload->>'runId'=$1",
            [second],
          );
          assert.equal(queued.rowCount, 1);
          await db.query(
            "UPDATE report_import_runs SET status='cancelled' WHERE id=$1",
            [second],
          );
          assert.equal(
            await runImportBatch(db, config, second),
            "done",
            "a cancelled import cannot resume automatically",
          );
          await db.query(
            "DELETE FROM automation_jobs WHERE payload->>'runId'=$1",
            [second],
          );
          await db.query("DELETE FROM report_import_runs WHERE id=$1", [
            second,
          ]);
        },
      );
      await t.test(
        "disabled source pauses an import and retains its checkpoint",
        async () => {
          const renewed = await db.query<{ id: string }>(
            "INSERT INTO report_import_runs(source_id,dry_run,started_by) VALUES($1,true,'111111111111111111') RETURNING id",
            [sourceId],
          );
          const second = renewed.rows[0]!.id;
          await db.query(
            "UPDATE report_index_sources SET enabled=false WHERE id=$1",
            [sourceId],
          );
          assert.equal(await runImportBatch(db, config, second), "done");
          const state = await db.query(
            "SELECT status,cursor,last_error FROM report_import_runs WHERE id=$1",
            [second],
          );
          assert.equal(state.rows[0].status, "paused");
          assert.equal(state.rows[0].cursor, null);
          assert.match(state.rows[0].last_error, /Source disabled/);
          await db.query(
            "UPDATE report_import_runs SET status='cancelled' WHERE id=$1",
            [second],
          );
          await db.query("DELETE FROM report_import_runs WHERE id=$1", [
            second,
          ]);
          await db.query(
            "UPDATE report_index_sources SET enabled=true WHERE id=$1",
            [sourceId],
          );
        },
      );
    } finally {
      globalThis.fetch = mock;
      if (runId) {
        await db.query(
          "DELETE FROM job_attempts WHERE job_id IN (SELECT id FROM automation_jobs WHERE payload->>'runId'=$1)",
          [runId],
        );
        await db.query(
          "DELETE FROM automation_jobs WHERE payload->>'runId'=$1",
          [runId],
        );
        await db.query("DELETE FROM report_import_runs WHERE id=$1", [runId]);
      }
      if (sourceId)
        await db.query("DELETE FROM report_index_sources WHERE id=$1", [
          sourceId,
        ]);
      await db.end();
    }
  },
);
