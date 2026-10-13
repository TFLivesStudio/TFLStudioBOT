-- 0.3: persistent ownership of a commit by a report, independent of publication.
CREATE TABLE github_report_commits (
 repository text NOT NULL,
 sha text NOT NULL,
 report_id bigint NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repository,sha),
 FOREIGN KEY(repository,sha) REFERENCES github_commits(repository,sha) ON DELETE RESTRICT
);
CREATE INDEX github_report_commits_report ON github_report_commits(report_id);
-- Restore associations from the old exact-SHA external keys, when possible.
INSERT INTO github_report_commits(repository,sha,report_id)
SELECT commits.repository, commits.sha, r.id
FROM reports AS r
CROSS JOIN LATERAL regexp_matches(r.external_key,'^github_push:(.+):([0-9a-f]{40}(,[0-9a-f]{40})*)$') AS captures
CROSS JOIN LATERAL unnest(string_to_array(captures[2],',')) AS sha_value
JOIN github_commits AS commits ON commits.repository=captures[1] AND commits.sha=sha_value
WHERE r.source='github'
ON CONFLICT(repository,sha) DO NOTHING;
-- Previously optimistic timestamps are not proof of publication.
UPDATE github_commits AS c
SET reported_at=CASE WHEN r.discord_message_id IS NOT NULL AND r.publication_status='published'
 THEN COALESCE(c.reported_at,r.updated_at) ELSE NULL END
FROM github_report_commits AS link JOIN reports AS r ON r.id=link.report_id
WHERE c.repository=link.repository AND c.sha=link.sha;
UPDATE github_sources AS sources
SET coverage_gap=concat_ws('; ',nullif(sources.coverage_gap,''),'Legacy reported_at without verifiable report association')
WHERE EXISTS (SELECT 1 FROM github_commits c WHERE c.repository=sources.repository
 AND c.reported_at IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM github_report_commits link WHERE link.repository=c.repository AND link.sha=c.sha));
-- Unverified historical marks are retained for review rather than blindly republished.
