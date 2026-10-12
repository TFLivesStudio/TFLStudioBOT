ALTER TABLE github_sources ADD COLUMN allow_prereleases boolean NOT NULL DEFAULT false;
ALTER TABLE github_sources ADD COLUMN repository_id bigint;
ALTER TABLE github_sources ADD COLUMN last_sync_at timestamptz;
ALTER TABLE github_sources ADD COLUMN last_sync_error text;
ALTER TABLE github_sources ADD COLUMN last_release_at timestamptz;
CREATE INDEX github_sources_sync_status ON github_sources(enabled,last_sync_at);
