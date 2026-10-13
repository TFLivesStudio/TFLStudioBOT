-- v0.3 fine-grained Discord synchronization and operational health.
ALTER TABLE reports ADD COLUMN discord_edited_at timestamptz;
ALTER TABLE reports ADD COLUMN thread_archived boolean;
ALTER TABLE reports ADD COLUMN thread_locked boolean;
ALTER TABLE reports ADD COLUMN last_index_event_at timestamptz;
CREATE INDEX reports_sync_state ON reports(department,sync_state,updated_at DESC);
CREATE TABLE worker_heartbeats (
 component text PRIMARY KEY,
 last_seen_at timestamptz NOT NULL,
 state text NOT NULL,
 detail text,
 last_job_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
