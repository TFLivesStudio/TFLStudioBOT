import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { DEPARTMENTS, NETWORK_TAGS, type DepartmentKey } from "./ids.js";
import type { PoolClient } from "pg";

export type AllocatedBatch = {
  reportId: string;
  sha: string[];
  status: "queued";
};
type Pending = { sha: string; title: string; author: string; url: string };
function readable(line: Pending): string {
  const subject = line.title
    .replaceAll("@", "@\u200b")
    .replaceAll("\n", " ")
    .slice(0, 110);
  const author = line.author
    .replaceAll("@", "@\u200b")
    .replaceAll("\n", " ")
    .slice(0, 55);
  const url = line.url.startsWith("https://github.com/") ? line.url : "";
  return "- " + subject + " — " + author + "\n" + url;
}
/** Persist the batch, SHA associations and publication job as one transaction. */
export async function allocateGithubBatch(
  db: DB,
  repository: string,
  department: DepartmentKey,
): Promise<AllocatedBatch | null> {
  if (!Object.hasOwn(DEPARTMENTS, department))
    throw new Error("Unknown GitHub destination");
  return transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "github:allocate:" + repository,
    ]);
    const commits = await client.query<Pending>(
      "SELECT c.sha,c.title,c.author,c.url FROM github_commits c " +
        "WHERE c.repository=$1 AND c.reported_at IS NULL " +
        "AND NOT EXISTS(SELECT 1 FROM github_report_commits x WHERE x.repository=c.repository AND x.sha=c.sha) " +
        "ORDER BY c.committed_at,c.sha LIMIT 25 FOR UPDATE OF c SKIP LOCKED",
      [repository],
    );
    if (commits.rows.length === 0) return null;
    let body = "";
    const included: Pending[] = [];
    for (const commit of commits.rows) {
      const segment = readable(commit);
      if (included.length && body.length + segment.length + 1 > 1450) break;
      body += (body ? "\n" : "") + segment.slice(0, 1450);
      included.push(commit);
    }
    const shas = included.map((c) => c.sha);
    const key = "github_push:" + repository + ":" + shas.join(",");
    const target = DEPARTMENTS[department];
    const defaultTags =
      department === "network"
        ? [NETWORK_TAGS.UPDATE]
        : department === "tflweb"
          ? ["1535421059707175123"]
          : [];
    const row = await client.query<{ id: string }>(
      "INSERT INTO reports(department,source,title,description,discord_channel_id,external_key,publication_status,tags,project) " +
        "VALUES($1,'github',$2,$3,$4,$5,'queued',$6,$7) ON CONFLICT(external_key) DO NOTHING RETURNING id",
      [
        department,
        "DESARROLLO / " + shas.length + " commits",
        body,
        target.destination,
        key,
        JSON.stringify(defaultTags),
        repository,
      ],
    );
    if (!row.rows[0])
      throw new Error("Batch idempotency conflict: requires reconciliation");
    const reportId = row.rows[0].id;
    for (const sha of shas)
      await client.query(
        "INSERT INTO github_report_commits(repository,sha,report_id) VALUES($1,$2,$3)",
        [repository, sha, reportId],
      );
    await client.query(
      "INSERT INTO automation_jobs(kind,payload,dedup_key,origin,destination,correlation) " +
        "VALUES('report_publish',$1,$2,'github',$3,$4) ON CONFLICT(dedup_key) DO NOTHING",
      [
        JSON.stringify({ reportId }),
        "report:" + reportId,
        target.destination,
        "STUDIO-REPORT-" + reportId,
      ],
    );
    const more = await client.query(
      "SELECT 1 FROM github_commits c WHERE c.repository=$1 AND c.reported_at IS NULL " +
        "AND NOT EXISTS(SELECT 1 FROM github_report_commits x WHERE x.repository=c.repository AND x.sha=c.sha) LIMIT 1",
      [repository],
    );
    if (more.rowCount)
      await client.query(
        "INSERT INTO automation_jobs(kind,payload,run_at,dedup_key,origin) " +
          "VALUES('github_push_summary',$1,now()+interval '1 minute',$2,'github_sync') ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({ repo: repository }), "push:remaining:" + reportId],
      );
    return { reportId, sha: shas, status: "queued" };
  });
}
export async function confirmGithubPublication(
  client: PoolClient,
  reportId: string,
): Promise<number> {
  const result = await client.query(
    "UPDATE github_commits c SET reported_at=COALESCE(c.reported_at,now()) " +
      "FROM github_report_commits x WHERE x.report_id=$1 AND x.repository=c.repository AND x.sha=c.sha AND c.reported_at IS NULL",
    [reportId],
  );
  return result.rowCount ?? 0;
}
export async function releaseCancelledBatch(
  client: PoolClient,
  reportId: string,
): Promise<void> {
  const links = await client.query<{ repository: string }>(
    "DELETE FROM github_report_commits WHERE report_id=$1 RETURNING repository",
    [reportId],
  );
  const repositories = [...new Set(links.rows.map((row) => row.repository))];
  for (const repo of repositories)
    await client.query(
      "INSERT INTO automation_jobs(kind,payload,run_at,dedup_key,origin) " +
        "SELECT 'github_push_summary',$2,now()+interval '1 minute',$3,'admin' " +
        "WHERE EXISTS(SELECT 1 FROM github_sources WHERE repository=$1 AND enabled AND push_enabled) " +
        "ON CONFLICT(dedup_key) DO NOTHING",
      [
        repo,
        JSON.stringify({ repo }),
        "push:cancelled:" + reportId + ":" + repo,
      ],
    );
}
