# Changelog

## 0.2.0 (desarrollo, octubre 2026)

- Corrección unificada de permisos GuildForum/GuildMedia y canales; pruebas de sobrescrituras.
- OAuth2 fortalecido y CSRF HMAC estable entre pestañas.
- Reportes mediante outbox transaccional; estado de publicación y conciliación ADMIN.
- Captura de reportes manuales opt-in y importación histórica con checkpoints, dry-run y API.
- Sincronización GitHub con HMAC, paginación y cursor CAS; releases y commits separados.
- Auditor estructural ampliado y snapshots restringidos comparables.
- Pruebas PostgreSQL 16, escenarios de concurrencia y fallos remotos simulados.
- Documentación de seguridad, arquitectura, migraciones y limitaciones.

**Aún no es una V1 de producción; no se ejecutó en el Discord real.**

# Changelog

## 0.1.0 — 2026-10-12

- Initial API-first modular Discord backend scaffold in official GitHub repository.
- PostgreSQL schema and versioned migration runner.
- Discord OAuth2 session authentication and CSRF protection; ADMIN/department role-scoped operations.
- Reporting, marketing records, guides, billing register, scheduled announcements and audit endpoints.
- GitHub webhook signature validation, independent push summary and release queues, deduplication keys and recovery states.
- Documentation for FeatherPanel deployment and explicit limitations.
- Partial structural /recopilar exports, effective channel permission checks.
- GitHub commit fallback polling with first-run cursor, editable announcement visual payloads and versioned guide updates.

- Dependency tree pinned in package-lock.json; CI installs with npm ci.
- Post-approval /inicio, restricted staff directory, billing subscriptions and marketing stats.

**Status:** development implementation, not verified in real production or claimed to be V1 complete.
