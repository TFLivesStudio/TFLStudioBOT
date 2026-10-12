CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL, csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, actor_id text, action text NOT NULL,
  target_kind text NOT NULL, target_id text, meta jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_occurred ON audit_events(occurred_at DESC);
CREATE TABLE reports (
  id bigserial PRIMARY KEY, department text NOT NULL, source text NOT NULL,
  title text NOT NULL, description text NOT NULL DEFAULT '', created_by text,
  discord_channel_id text NOT NULL, discord_message_id text,
  discord_thread_id text, external_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_filter ON reports(department,created_at DESC);
CREATE TABLE publication_records (
  id bigserial PRIMARY KEY, project text NOT NULL, platform text NOT NULL,
  url text NOT NULL, published_at timestamptz NOT NULL,
  submitted_by text NOT NULL, notes text NOT NULL DEFAULT '',
  discord_message_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX publication_by_date ON publication_records(published_at DESC);
CREATE TABLE guides (
  id bigserial PRIMARY KEY, category text NOT NULL, title text NOT NULL,
  body text NOT NULL, visibility_department text, discord_thread_id text,
  version integer NOT NULL DEFAULT 1, updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE announcements (
  id bigserial PRIMARY KEY, target_channel_id text NOT NULL,
  title text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz, published_at timestamptz,
  discord_message_id text, author_id text NOT NULL,
  CONSTRAINT announcement_status CHECK (status IN ('draft','scheduled','publishing','published','failed'))
);
CREATE TABLE staff_assignments (
  user_id text NOT NULL, department text NOT NULL, assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,department)
);
CREATE TABLE billing_records (
  id bigserial PRIMARY KEY, label text NOT NULL, amount_minor bigint NOT NULL,
  currency char(3) NOT NULL, category text NOT NULL, due_at timestamptz,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_sources (
  id bigserial PRIMARY KEY, repository text NOT NULL UNIQUE, department text NOT NULL,
  enabled boolean NOT NULL DEFAULT false, push_enabled boolean NOT NULL DEFAULT true,
  release_enabled boolean NOT NULL DEFAULT true, batch_minutes integer NOT NULL DEFAULT 30
  CHECK (batch_minutes BETWEEN 5 AND 1440)
);
CREATE TABLE webhook_deliveries (
  delivery_id text PRIMARY KEY, event_name text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_commits (
  repository text NOT NULL, sha text NOT NULL, author text NOT NULL,
  title text NOT NULL, url text NOT NULL, committed_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz, PRIMARY KEY(repository, sha)
);
CREATE TABLE automation_jobs (
  id bigserial PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','needs_reconciliation')),
  run_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
  dedup_key text UNIQUE
);
CREATE INDEX jobs_due ON automation_jobs(run_at) WHERE status = 'queued';
INSERT INTO github_sources(repository,department,enabled,batch_minutes)
VALUES('TFLivesStudio/TFLClient','client',false,30);
