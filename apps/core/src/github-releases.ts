import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { collectComparison } from "./github.js";

type GitRef = { object: { sha: string; type: string } };
type GitTag = { object: { sha: string; type: string } };
export type OfficialRelease = {
  repo: string;
  releaseId: number;
  tag: string;
  name?: string | undefined;
  body: string;
  url: string;
  date?: string | undefined;
  prerelease?: boolean;
  edited?: boolean;
};
const sha = /^[a-f0-9]{40}$/;
async function request<T>(
  config: Config,
  repo: string,
  path: string,
): Promise<T> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    throw new Error("Invalid GitHub repository");
  const res = await fetch("https://api.github.com/repos/" + repo + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "TFL-Studio-Core",
      ...(config.GITHUB_TOKEN
        ? { Authorization: "Bearer " + config.GITHUB_TOKEN }
        : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("GitHub tag API " + res.status);
  return res.json() as Promise<T>;
}
export async function resolveTag(
  config: Config,
  repo: string,
  tag: string,
): Promise<{ refSha: string; commitSha: string }> {
  if (tag.length > 200 || !tag || tag.includes(".."))
    throw new Error("Invalid Git tag");
  const ref = await request<GitRef>(
    config,
    repo,
    "/git/ref/tags/" + tag.split("/").map(encodeURIComponent).join("/"),
  );
  const refSha = ref.object.sha;
  let node = ref.object;
  for (let depth = 0; depth < 3 && node.type === "tag"; depth++) {
    node = (await request<GitTag>(config, repo, "/git/tags/" + node.sha))
      .object;
  }
  if (node.type !== "commit" || !sha.test(node.sha) || !sha.test(refSha))
    throw new Error("Tag could not be resolved to an immutable commit SHA");
  return { refSha, commitSha: node.sha };
}
/** Stores verified tag/range evidence without discarding uncertain history or moving tags. */
export async function recordReleaseProvenance(
  db: DB,
  config: Config,
  release: OfficialRelease,
  reportId: string | null,
): Promise<void> {
  if (!Number.isSafeInteger(release.releaseId) || release.releaseId <= 0)
    throw new Error("Invalid release identity");
  let refSha: string | null = null,
    commitSha: string | null = null,
    reason: "verified" | "tag_unavailable" | "range_unavailable" = "verified";
  let range: string[] = [];
  let previous: { release_id: string; resolved_commit_sha: string } | undefined;
  try {
    const resolved = await resolveTag(config, release.repo, release.tag);
    refSha = resolved.refSha;
    commitSha = resolved.commitSha;
  } catch {
    reason = "tag_unavailable";
  }
  if (commitSha && release.date) {
    const result = await db.query<{
      release_id: string;
      resolved_commit_sha: string;
    }>(
      "SELECT release_id,resolved_commit_sha FROM github_release_records " +
        "WHERE repository=$1 AND published_at < $2 AND resolved_commit_sha IS NOT NULL " +
        "ORDER BY published_at DESC LIMIT 1",
      [release.repo, release.date],
    );
    previous = result.rows[0];
    if (previous && previous.resolved_commit_sha !== commitSha) {
      try {
        range = (
          await collectComparison(
            config,
            release.repo,
            previous.resolved_commit_sha,
            commitSha,
          )
        ).map((c) => c.sha);
      } catch {
        reason = "range_unavailable";
      }
    } else if (!previous) reason = "range_unavailable";
  } else if (commitSha) reason = "range_unavailable";
  await transaction(db, async (c) => {
    const current = await c.query<{
      resolved_commit_sha: string | null;
      official_notes: string;
      tag: string;
    }>(
      "SELECT resolved_commit_sha,official_notes,tag FROM github_release_records " +
        "WHERE repository=$1 AND release_id=$2 FOR UPDATE",
      [release.repo, release.releaseId],
    );
    const old = current.rows[0];
    const tagMoved = !!(
      old?.resolved_commit_sha &&
      commitSha &&
      old.resolved_commit_sha !== commitSha
    );
    const edited = !!(
      release.edited ||
      (old && old.official_notes !== release.body)
    );
    await c.query(
      "INSERT INTO github_release_records(repository,release_id,tag,title,official_notes,official_url,prerelease,published_at," +
        "tag_reference_sha,resolved_commit_sha,observed_commit_sha,previous_release_id,relation_status,change_state,report_id) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14) " +
        "ON CONFLICT(repository,release_id) DO UPDATE SET " +
        "title=EXCLUDED.title,official_notes=EXCLUDED.official_notes,official_url=EXCLUDED.official_url," +
        "observed_commit_sha=EXCLUDED.observed_commit_sha," +
        "relation_status=CASE WHEN $15 THEN 'tag_moved' ELSE EXCLUDED.relation_status END," +
        "change_state=CASE WHEN $16 THEN 'edited_requires_review' ELSE github_release_records.change_state END," +
        "report_id=COALESCE(github_release_records.report_id,EXCLUDED.report_id),updated_at=now()",
      [
        release.repo,
        release.releaseId,
        release.tag,
        release.name ?? null,
        release.body,
        release.url,
        !!release.prerelease,
        release.date ?? null,
        refSha,
        commitSha,
        previous?.release_id ?? null,
        reason,
        edited ? "edited_requires_review" : "current",
        reportId,
        tagMoved,
        edited,
      ],
    );
    // A moved tag must not silently rewrite the original SHA/range relationship.
    if (!tagMoved && range.length && reason === "verified") {
      for (const currentSha of range)
        await c.query(
          "INSERT INTO github_release_commits(repository,release_id,sha) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [release.repo, release.releaseId, currentSha],
        );
    }
  });
}
