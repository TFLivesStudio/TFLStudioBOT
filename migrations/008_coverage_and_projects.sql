ALTER TABLE github_sources ADD COLUMN coverage_gap text;
ALTER TABLE reports ADD COLUMN project text;
CREATE INDEX reports_project_time ON reports(project,occurred_at DESC);
