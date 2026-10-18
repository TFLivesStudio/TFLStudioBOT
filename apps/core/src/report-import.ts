import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { IDS } from "./ids.js";
import {
  indexDiscordMessage,
  type Indexable,
  type Source,
} from "./report-index.js";

type DiscordMessage = {
  id: string;
  channel_id: string;
  content?: string;
  timestamp: string;
  author?: { id: string; bot: boolean };
  attachments?: Array<{
    id: string;
    filename: string;
    size: number;
    content_type?: string;
  }>;
};
type DiscordThread = {
  id: string;
  parent_id: string;
  name: string;
  applied_tags?: string[];
  thread_metadata?: { archive_timestamp?: string };
};
type Run = {
  id: string;
  source_id: string;
  status: string;
  dry_run: boolean;
  cursor: string | null;
  phase: string;
  processed: number;
  inserted: number;
  errors: number;
  lease_token: string | null;
};
const limit = 20;
async function discordApi<T>(config: Config, path: string): Promise<T> {
  for (let retry = 0; retry < 3; retry++) {
    const res = await fetch("https://discord.com/api/v10" + path, {
      headers: {
        Authorization: "Bot " + config.BOT_TOKEN,
        "User-Agent": "TFL-Studio-Core/0.3",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429 && retry < 2) {
      const delay = Math.min(
        8000,
        Math.max(500, Number(res.headers.get("Retry-After") ?? "1") * 1000),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!res.ok) throw new Error("Discord import HTTP " + res.status);
    return res.json() as Promise<T>;
  }
  throw new Error("Discord import retry budget exhausted");
}
function asIndexable(
  msg: DiscordMessage,
  source: Source,
  thread?: DiscordThread,
): Indexable {
  return {
    id: msg.id,
    channelId: msg.channel_id,
    parentId: thread ? source.channel_id : null,
    guildId: IDS.guild,
    authorId: msg.author?.id ?? null,
    authorIsBot: msg.author?.bot ?? false,
    content: source.capture_content ? (msg.content ?? null) : null,
    createdAt: msg.timestamp,
    title: thread?.name ?? null,
    tags: thread?.applied_tags ?? [],
    attachments: (msg.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.filename,
      size: a.size,
      contentType: a.content_type ?? null,
    })),
  };
}
/** One lease per import: duplicate worker claims return without touching history. */
export async function runImportBatch(
  db: DB,
  config: Config,
  id: string,
): Promise<"more" | "done"> {
  const token = randomUUID();
  const claimed = await db.query<Run>(
    "UPDATE report_import_runs SET status='running',lease_token=$2," +
      "lease_expires_at=now()+interval '30 minutes',updated_at=now() " +
      "WHERE id=$1 AND status IN ('queued','running') " +
      "AND (lease_token IS NULL OR lease_expires_at<now()) RETURNING *",
    [id, token],
  );
  const run = claimed.rows[0];
  if (!run) return "done";
  let phase = run.phase,
    cursor = run.cursor,
    processed = 0,
    inserted = 0,
    finished = false;
  try {
    const src = await db.query<Source>(
      "SELECT * FROM report_index_sources WHERE id=$1 AND enabled AND historical_enabled",
      [run.source_id],
    );
    const source = src.rows[0];
    if (!source) throw new Error("Source disabled for history");
    const forum = ["network", "client", "tflweb", "webBrillara"].includes(
      source.department,
    );
    if (!forum) {
      const args = new URLSearchParams({ limit: String(limit) });
      if (cursor) args.set("before", cursor);
      const messages = await discordApi<DiscordMessage[]>(
        config,
        "/channels/" + source.channel_id + "/messages?" + args,
      );
      for (const msg of messages) {
        if (
          !run.dry_run &&
          (await indexDiscordMessage(db, source, asIndexable(msg, source))) ===
            "indexed"
        )
          inserted++;
        processed++;
      }
      if (messages.length) cursor = messages[messages.length - 1]!.id;
      finished = messages.length < limit;
    } else if (phase === "start" || phase === "active") {
      phase = "active";
      const response = await discordApi<{ threads: DiscordThread[] }>(
        config,
        "/guilds/" + IDS.guild + "/threads/active",
      );
      const threads = response.threads
        .filter((t) => t.parent_id === source.channel_id)
        .sort((a, b) => a.id.localeCompare(b.id));
      const items = threads
        .filter((t) => !cursor || BigInt(t.id) > BigInt(cursor))
        .slice(0, limit);
      for (const thread of items) {
        const starter = await discordApi<DiscordMessage>(
          config,
          "/channels/" + thread.id + "/messages/" + thread.id,
        );
        if (
          !run.dry_run &&
          (await indexDiscordMessage(
            db,
            source,
            asIndexable(starter, source, thread),
          )) === "indexed"
        )
          inserted++;
        processed++;
      }
      if (items.length) cursor = items[items.length - 1]!.id;
      if (items.length < limit) {
        phase = "archived";
        cursor = null;
      }
    } else {
      phase = "archived";
      const args = new URLSearchParams({ limit: String(limit) });
      if (cursor) args.set("before", cursor);
      const response = await discordApi<{
        threads: DiscordThread[];
        has_more: boolean;
      }>(
        config,
        "/channels/" + source.channel_id + "/threads/archived/public?" + args,
      );
      for (const thread of response.threads) {
        const starter = await discordApi<DiscordMessage>(
          config,
          "/channels/" + thread.id + "/messages/" + thread.id,
        );
        if (
          !run.dry_run &&
          (await indexDiscordMessage(
            db,
            source,
            asIndexable(starter, source, thread),
          )) === "indexed"
        )
          inserted++;
        processed++;
      }
      const stamp =
        response.threads.at(-1)?.thread_metadata?.archive_timestamp ?? null;
      if (response.has_more && (!stamp || stamp === cursor)) {
        throw new Error(
          "Archived pagination cursor is ambiguous; manual review required",
        );
      }
      if (stamp) cursor = stamp;
      finished = !response.has_more;
    }
    // Checkpoint and continuation job are in the SAME transaction.
    const result = await transaction(db, async (client) => {
      const changed = await client.query(
        "UPDATE report_import_runs SET phase=$3,cursor=$4,processed=processed+$5,inserted=inserted+$6," +
          "status=$7,lease_token=NULL,lease_expires_at=NULL,checkpoint_at=now(),updated_at=now()," +
          "coverage=CASE WHEN $7='done' AND errors=0 AND $8=false THEN 'complete' ELSE 'partial' END," +
          "finished_at=CASE WHEN $7='done' THEN now() ELSE finished_at END " +
          "WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING processed,phase,cursor",
        [
          id,
          token,
          phase,
          cursor,
          processed,
          inserted,
          finished ? "done" : "queued",
          forum,
        ],
      );
      if (!changed.rows[0]) return false; // cancel/pause occurred while batch was in flight
      if (!finished)
        await client.query(
          "INSERT INTO automation_jobs(kind,payload,dedup_key,origin) " +
            "VALUES('history_import',$1,$2,'admin') ON CONFLICT(dedup_key) DO NOTHING",
          [
            JSON.stringify({ runId: id }),
            "import:" + id + ":" + changed.rows[0].processed + ":" + phase,
          ],
        );
      return true;
    });
    return result && !finished ? "more" : "done";
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message.slice(0, 250)
        : "Unknown import failure";
    await db.query(
      "UPDATE report_import_runs SET status='paused',lease_token=NULL,lease_expires_at=NULL," +
        "coverage='partial',errors=errors+1,last_error=$3,updated_at=now() " +
        "WHERE id=$1 AND lease_token=$2 AND status='running'",
      [id, token, reason],
    );
    return "done";
  }
}
/** Rebuilds a missing job after a crash, without activating disabled/cancelled sources. */
export async function recoverOrphanedImports(
  db: DB,
): Promise<{ recovered: number; scheduled: number }> {
  return transaction(db, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('studio:recover-imports'))",
    );
    const result = await client.query(
      "UPDATE report_import_runs SET status='queued',lease_token=NULL,lease_expires_at=NULL," +
        "coverage='partial',last_error='Recovered expired import lease',updated_at=now() " +
        "WHERE status='running' AND (lease_token IS NULL OR lease_expires_at<now()) " +
        "RETURNING id",
    );
    const created = await client.query(
      "INSERT INTO automation_jobs(kind,payload,origin,dedup_key) " +
        "SELECT 'history_import',jsonb_build_object('runId',r.id::text),'recovery'," +
        "'import:recovered:'||r.id::text||':'||extract(epoch from now())::bigint::text " +
        "FROM report_import_runs r JOIN report_index_sources s ON s.id=r.source_id " +
        "WHERE r.status='queued' AND s.enabled AND s.historical_enabled " +
        "AND NOT EXISTS(SELECT 1 FROM automation_jobs j WHERE j.kind='history_import' " +
        "AND j.status IN ('queued','running') AND j.payload->>'runId'=r.id::text) " +
        "RETURNING id",
    );
    await client.query(
      "UPDATE report_import_runs r SET status='paused',coverage='partial'," +
        "last_error='Source disabled before import recovery' FROM report_index_sources s " +
        "WHERE s.id=r.source_id AND r.status='queued' AND (NOT s.enabled OR NOT s.historical_enabled)",
    );
    return {
      recovered: result.rowCount ?? 0,
      scheduled: created.rowCount ?? 0,
    };
  });
}
