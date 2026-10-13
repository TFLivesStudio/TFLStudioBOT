-- 0.3 resilient historical imports with recoverable per-run lease.
ALTER TABLE report_import_runs ADD COLUMN lease_token text;
ALTER TABLE report_import_runs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE report_import_runs ADD COLUMN checkpoint_at timestamptz;
ALTER TABLE report_import_runs ADD COLUMN coverage text NOT NULL DEFAULT 'unknown'
  CHECK(coverage IN ('unknown','partial','complete'));
CREATE INDEX report_import_expired_lease ON report_import_runs(lease_expires_at)
  WHERE status='running';
-- A paused scan still reserves its source; conflicting scans are not started.
CREATE UNIQUE INDEX report_import_one_active_source ON report_import_runs(source_id)
 WHERE status IN ('queued','running','paused');
