ALTER TABLE reports DROP CONSTRAINT reports_publication_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_publication_status_check
 CHECK(publication_status IN ('queued','publishing','published','needs_reconciliation','indexed','deleted','cancelled'));
