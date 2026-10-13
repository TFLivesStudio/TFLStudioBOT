import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { DEPARTMENTS, NETWORK_TAGS, type DepartmentKey } from "./ids.js";

/** Persist intent and outbox atomically. No Discord network request inside a SQL transaction. */
export async function createReport(db: DB, _client: Client, department: DepartmentKey, title: string, description: string, by: string | null, key: string, tags: string[] = [], project: string | null = null): Promise<{id:string;status:string;url?:string}> {
  const target = DEPARTMENTS[department];
  if (!tags.length && department === "network") tags=[NETWORK_TAGS.UPDATE];
  if (!tags.length && department === "tflweb") tags=["1535421059707175123"];
  return transaction(db, async c => {
    const result=await c.query<{id:string;title:string;description:string;department:string;discord_message_id:string|null;discord_thread_id:string|null;publication_status:string;project:string|null}>(
      "INSERT INTO reports(department,source,title,description,created_by,discord_channel_id,external_key,publication_status,tags,project) VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9) ON CONFLICT(external_key) DO UPDATE SET external_key=EXCLUDED.external_key RETURNING id,title,description,department,discord_message_id,discord_thread_id,publication_status,project",
      [department,by?"bot":"github",title,description,by,target.destination,key,JSON.stringify(tags),project]
    );
    const row=result.rows[0]!;
    // A caller cannot reuse the idempotency key to silently replace an existing report.
    if(row.title!==title || row.description!==description || row.department!==department || row.project!==project)
      throw Object.assign(new Error("Idempotency key reused with different content"),{statusCode:409});
    if (!row.discord_message_id && row.publication_status === "queued") {
      await c.query("INSERT INTO automation_jobs(kind,payload,dedup_key,origin,destination,correlation) VALUES('report_publish',$1,$2,$3,$4,$5) ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({reportId:row.id}),"report:"+row.id,by?"manual":"github",target.destination,"STUDIO-REPORT-"+row.id]);
    }
    if(row.discord_message_id) return {
      id:row.id,status:"published",
      url:"https://discord.com/channels/1264656310205415474/"+(row.discord_thread_id??target.destination)+"/"+row.discord_message_id
    };
    return {id:row.id,status:row.publication_status};
  });
}
