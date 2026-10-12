ALTER TABLE github_sources ADD COLUMN default_branch text NOT NULL DEFAULT 'main';
ALTER TABLE github_sources ADD COLUMN last_commit_sha text;
ALTER TABLE github_sources ADD COLUMN enabled_at timestamptz;
ALTER TABLE announcements ADD COLUMN visual_payload jsonb NOT NULL DEFAULT '{}';
CREATE TABLE announcement_templates (
  id bigserial PRIMARY KEY, name text NOT NULL UNIQUE,
  visual_payload jsonb NOT NULL DEFAULT '{}', created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE guide_revisions (
  id bigserial PRIMARY KEY, guide_id bigint NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  version integer NOT NULL, title text NOT NULL, body text NOT NULL,
  category text NOT NULL, visibility_department text,
  edited_by text NOT NULL, edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guide_id,version)
);
CREATE INDEX guide_revisions_guide_id ON guide_revisions(guide_id,version DESC);
