-- Outbox and authorized report index. Existing migrations remain untouched.
ALTER TABLE automation_jobs DROP CONSTRAINT automation_jobs_status_check;
ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_status_check
  CHECK(status IN ('queued','running','done','failed','needs_reconciliation','cancelled'));
ALTER TABLE automation_jobs ADD COLUMN origin text;
ALTER TABLE automation_jobs ADD COLUMN destination text;
ALTER TABLE automation_jobs ADD COLUMN correlation text;
ALTER TABLE automation_jobs ADD COLUMN completed_at timestamptz;
ALTER TABLE automation_jobs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE automation_jobs ADD COLUMN remote_message_id text;
ALTER TABLE automation_jobs ADD COLUMN remote_channel_id text;
CREATE TABLE job_attempts(
 id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES automation_jobs(id),
 attempt integer NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz, outcome text, safe_error text,
 UNIQUE(job_id,attempt)
);
CREATE INDEX job_attempts_lookup ON job_attempts(job_id,attempt DESC);

ALTER TABLE reports ADD COLUMN guild_id text NOT NULL DEFAULT '1264656310205415474';
ALTER TABLE reports ADD COLUMN publication_status text NOT NULL DEFAULT 'indexed'
  CHECK(publication_status IN ('queued','publishing','published','needs_reconciliation','indexed','deleted'));
ALTER TABLE reports ADD COLUMN author_id text;
ALTER TABLE reports ADD COLUMN indexed_at timestamptz;
ALTER TABLE reports ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE reports ADD COLUMN deleted_at timestamptz;
ALTER TABLE reports ADD COLUMN content_state text NOT NULL DEFAULT 'available'
  CHECK(content_state IN ('available','partial','unavailable'));
ALTER TABLE reports ADD COLUMN sync_state text NOT NULL DEFAULT 'complete'
  CHECK(sync_state IN ('complete','partial','unknown','missing','deleted'));
ALTER TABLE reports ADD COLUMN tags jsonb NOT NULL DEFAULT '[]';
ALTER TABLE reports ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]';
ALTER TABLE reports ADD COLUMN origin_created_at timestamptz;
CREATE UNIQUE INDEX reports_discord_message_unique ON reports(guild_id,discord_message_id)
 WHERE discord_message_id IS NOT NULL;
CREATE INDEX reports_sync_changed ON reports(updated_at DESC);

CREATE TABLE report_index_sources(
 id bigserial PRIMARY KEY, channel_id text NOT NULL UNIQUE, department text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 capture_content boolean NOT NULL DEFAULT false,
 historical_enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO report_index_sources(channel_id,department) VALUES
 ('1535414989307908226','network'),
 ('1559244927345631232','client'),
 ('1535420733151510638','tflweb'),
 ('1559247525460971640','webBrillara'),
 ('1517346957671137310','hosting'),
 ('1503898379728720003','publicidad'),
 ('1543362341973008524','propiedades'),
 ('1549947011778740265','merch');

CREATE TABLE report_import_runs(
 id bigserial PRIMARY KEY, source_id bigint NOT NULL REFERENCES report_index_sources(id),
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN ('queued','running','paused','done','cancelled','failed')),
 dry_run boolean NOT NULL DEFAULT true,
 cursor text, phase text NOT NULL DEFAULT 'start',
 processed bigint NOT NULL DEFAULT 0, inserted bigint NOT NULL DEFAULT 0,
 errors bigint NOT NULL DEFAULT 0, last_error text, started_by text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_import_progress ON report_import_runs(status,updated_at);
