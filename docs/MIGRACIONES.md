# MIGRACIONES POSTGRESQL — 0.3.0

| Versión | Esquema |
|---|---|
| 001_initial.sql | Sesiones, personal, anuncios, Billing, reportes y trabajos |
| 002_sources_and_content.sql | GitHub, guías versionadas, plantillas |
| 003_billing_subscriptions.sql | Suscripciones |
| 004_outbox_and_report_index.sql | Outbox, intentos e índice |
| 005_github_integrity.sql | Configuración y cursores GitHub |
| 006_auditor_snapshots.sql | Inventarios |
| 007_report_cancelled.sql | Estado cancelled |
| 008_coverage_and_projects.sql | Cobertura y proyectos |
| 009_github_commit_associations.sql | Asociación persistente SHA/reporte, migración conservadora reported_at |
| 010_import_recovery.sql | Lease, checkpoint y fuente exclusiva de importación |
| 011_admin_workflows.sql | Anuncios/guías/Billing con versiones y automatizaciones |
| 012_github_release_provenance.sql | Tags, releases, SHA/rangos verificables |
| 013_report_sync_telemetry.sql | Estado detallado de Discord y heartbeat |

Los scripts 001-008 históricos NO se modificaron. Las migraciones nuevas agregan tablas/columnas e índices; la 009 reconstruye únicamente asociaciones demostrables por SHA, no inventa historial desconocido.

CI ejecuta el migrador dos veces en PostgreSQL 16 aislado, después las pruebas y build. **Antes de producción:** backup restaurable, verificación de datos antiguos en staging, revisión de permisos del usuario SQL y plan de restauración. Un rollback de código no revierte por sí mismo el esquema.
