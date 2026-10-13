# MIGRACIONES POSTGRESQL

| Archivo | Alcance |
|---|---|
| 001_initial.sql | Sesiones, reportes, auditoría, jobs y módulos iniciales |
| 002_sources_and_content.sql | Fuentes GitHub, plantillas de anuncios y guías versionadas |
| 003_billing_subscriptions.sql | Suscripciones de Billing |
| 004_outbox_and_report_index.sql | Outbox, intentos y fuentes/importaciones |
| 005_github_integrity.sql | Rama, prereleases y seguimiento de sincronización |
| 006_auditor_snapshots.sql | Inventarios estructurales protegidos |

El migrador usa transacciones y advisory lock y registra cada archivo aplicado. No modificar scripts históricos; añadir nuevas migraciones. GitHub Actions ejecuta migraciones dos veces sobre PostgreSQL 16 de prueba y valida idempotencia.

Antes de producción: obtener backup restaurable, aplicar en staging, ejecutar pruebas, revisar compatibilidad y preparar recuperación manual. No se han ejecutado migraciones en la BD real.
