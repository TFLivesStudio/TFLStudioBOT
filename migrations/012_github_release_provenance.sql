-- 0.3 GitHub release provenance. Do not infer equivalence from changelog text.
CREATE TABLE github_release_records (
 repository text NOT NULL,
 release_id bigint NOT NULL,
 tag text NOT NULL,
 title text,
 official_notes text NOT NULL DEFAULT '',
 official_url text NOT NULL,
 prerelease boolean NOT NULL DEFAULT false,
 published_at timestamptz,
 tag_reference_sha text,
 resolved_commit_sha text,
 observed_commit_sha text,
 previous_release_id bigint,
 relation_status text NOT NULL DEFAULT 'unknown'
  CHECK(relation_status IN ('verified','unknown','tag_unavailable','range_unavailable','tag_moved')),
 change_state text NOT NULL DEFAULT 'current'
  CHECK(change_state IN ('current','edited_requires_review')),
 report_id bigint REFERENCES reports(id),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repository,release_id)
);
CREATE TABLE github_release_commits (
 repository text NOT NULL,
 release_id bigint NOT NULL,
 sha text NOT NULL,
 PRIMARY KEY(repository,release_id,sha),
 FOREIGN KEY(repository,release_id) REFERENCES github_release_records(repository,release_id) ON DELETE CASCADE
);
CREATE INDEX github_release_commits_sha ON github_release_commits(repository,sha);
