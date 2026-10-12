CREATE TABLE audit_snapshots (
 id bigserial PRIMARY KEY,
 requested_by text NOT NULL,
 status text NOT NULL DEFAULT 'queued'
 CHECK(status IN ('queued','running','done','failed')),
 options jsonb NOT NULL DEFAULT '{}',
 snapshot jsonb,
 markdown text,
 completeness text NOT NULL DEFAULT 'unknown'
 CHECK(completeness IN ('complete','partial','unknown')),
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX audit_snapshots_recent ON audit_snapshots(created_at DESC);
