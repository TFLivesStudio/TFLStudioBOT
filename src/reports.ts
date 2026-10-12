import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { postToDestination } from "./discord.js";
export async function createReport(db: DB, client: Client, department: DepartmentKey, title: string, description: string, by: string | null, key: string, tags: string[] = []): Promise<{id: string; url: string}> {
  const target = DEPARTMENTS[department];
  const pending = await db.query<{id:string;discord_message_id:string|null;discord_thread_id:string|null}>(
    "INSERT INTO reports(department,source,title,description,created_by,discord_channel_id,external_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(external_key) DO UPDATE SET external_key=EXCLUDED.external_key RETURNING id,discord_message_id,discord_thread_id",
    [department, by ? "manual" : "github", title, description, by, target.destination, key]
  );
  const row = pending.rows[0]!;
  if (row.discord_message_id) {
    const cid = row.discord_thread_id ?? target.destination;
    return { id: row.id, url: "https://discord.com/channels/" + "1264656310205415474" + "/" + cid + "/" + row.discord_message_id };
  }
  // Competing writers must not publish the same report concurrently. Advisory lock is held for the publication.
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const current = await c.query<{discord_message_id:string|null;discord_thread_id:string|null}>("SELECT discord_message_id,discord_thread_id FROM reports WHERE id=$1 FOR UPDATE", [row.id]);
    const latest = current.rows[0]!;
    if (latest.discord_message_id) {
      await c.query("COMMIT");
      return { id: row.id, url: "https://discord.com/channels/1264656310205415474/" + (latest.discord_thread_id ?? target.destination) + "/" + latest.discord_message_id };
    }
    const posted = await postToDestination(client, target.destination, title, description, tags);
    await c.query("UPDATE reports SET discord_message_id=$1,discord_thread_id=$2 WHERE id=$3", [posted.messageId, posted.threadId, row.id]);
    await c.query("COMMIT");
    return { id: row.id, url: posted.url };
  } catch (error) {
    await c.query("ROLLBACK");
    // Discord publication may have succeeded before a DB failure: reconcile before retrying.
    throw error;
  } finally { c.release(); }
}
