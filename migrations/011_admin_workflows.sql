-- v0.3: administration lifecycle and typed automation contracts.
ALTER TABLE announcements DROP CONSTRAINT announcement_status;
ALTER TABLE announcements ADD CONSTRAINT announcement_status
  CHECK(status IN ('draft','scheduled','publishing','published','failed','cancelled'));
ALTER TABLE announcements ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE announcements ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE announcements ADD COLUMN updated_by text;
ALTER TABLE announcements ADD COLUMN cancelled_at timestamptz;
ALTER TABLE announcements ADD COLUMN last_error text;
CREATE INDEX announcements_admin_status ON announcements(status,scheduled_at);
ALTER TABLE announcement_templates ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE announcement_templates ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE announcement_templates ADD COLUMN updated_by text;
ALTER TABLE guides ADD COLUMN lifecycle text NOT NULL DEFAULT 'active'
  CHECK(lifecycle IN ('active','archived'));
ALTER TABLE guides ADD COLUMN discord_sync_state text NOT NULL DEFAULT 'unlinked'
  CHECK(discord_sync_state IN ('unlinked','queued','published','linked','conflict','missing'));
ALTER TABLE guides ADD COLUMN discord_synced_version integer;
CREATE INDEX guides_category_status ON guides(category,lifecycle,updated_at DESC);
ALTER TABLE billing_records ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE billing_records ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK(status IN ('active','archived','void'));
ALTER TABLE billing_records ADD COLUMN notes text NOT NULL DEFAULT '';
ALTER TABLE billing_records ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE billing_records ADD COLUMN updated_by text;
ALTER TABLE billing_subscriptions ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE billing_change_history (
 id bigserial PRIMARY KEY,
 resource_kind text NOT NULL CHECK(resource_kind IN ('record','subscription')),
 resource_id bigint NOT NULL,
 version integer NOT NULL,
 action text NOT NULL,
 previous jsonb,
 current jsonb,
 actor_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_history_resource ON billing_change_history(resource_kind,resource_id,occurred_at DESC);
CREATE TABLE automation_definitions (
 id bigserial PRIMARY KEY,
 name text NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN
  ('github_sync','github_releases_sync','github_push_summary','announcement','report_watch','admin_notice','maintenance')),
 trigger_kind text NOT NULL CHECK(trigger_kind IN ('manual','interval')),
 config jsonb NOT NULL DEFAULT '{}',
 enabled boolean NOT NULL DEFAULT false,
 interval_minutes integer CHECK(interval_minutes BETWEEN 5 AND 1440),
 next_run_at timestamptz,
 last_run_at timestamptz,
 last_result text,
 last_error text,
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 CONSTRAINT automation_interval_valid CHECK(
  (trigger_kind='interval' AND interval_minutes IS NOT NULL)
  OR (trigger_kind='manual' AND interval_minutes IS NULL))
);
ALTER TABLE automation_jobs ADD COLUMN automation_id bigint REFERENCES automation_definitions(id) ON DELETE SET NULL;
CREATE INDEX automations_due ON automation_definitions(next_run_at)
 WHERE enabled AND trigger_kind='interval';
CREATE TABLE admin_notifications (
 id bigserial PRIMARY KEY,
 category text NOT NULL,
 message text NOT NULL,
 source_job_id bigint REFERENCES automation_jobs(id) ON DELETE SET NULL,
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_job_id,category)
);
