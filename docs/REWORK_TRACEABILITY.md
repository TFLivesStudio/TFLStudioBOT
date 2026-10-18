# Auditoría y matriz de trazabilidad

Base auditada: commit `e7db70ab41dab0e818b63b275fa6f9d4fb4a1eed`, 0.3.0. Se revisaron los 30 archivos fuente, las 13 migraciones, la suite, configuración y documentación. El código es la fuente de verdad; los documentos de cierre anteriores se conservan como históricos.

## Hallazgos y cambios

| Hallazgo en 0.3 | Acción en 0.4 |
|---|---|
| Runtime/scripts Node, sin dashboard | Bun Workspaces, Core persistente y Next conectado |
| Runner SQL requería todos los secretos Discord | database aislado: migrate solo necesita DATABASE_URL |
| Variables opcionales vacías en el ejemplo podían invalidar config | Normalización del secreto de webhook vacío y validación de orígenes |
| Stop detenía intervalos sin esperar tareas | Drenaje de jobs, sweep y recuperación antes de cerrar conexiones |
| Cache de miembro en algunos comandos y ephemeral obsoleto | Fetch forzado, aprobación comprobada y MessageFlags.Ephemeral |
| Sin control del solicitante en el momento de enviar jobs humanos | Nueva comprobación de aprobación/rol/overwrites antes de publicar |
| Logger sin redacción explícita / query OAuth | Redacción de cabeceras sensibles y URL sin querystring |
| Exportación de reportes aplicaba solo departamento | Misma consulta y filtros para lista y exportación |
| Anuncios versionados sin contenido de revisiones previas | SQL 014 y snapshot transaccional de la edición anterior |
| Asignación interna sin validar miembro o autoasignación | Rechazo de pendiente/ausente/propio actor, retirada auditada y permisos efectivos |
| Sin CI de navegador ni comprobación de frontend | E2E con Core+PG reales y Discord simulado; contratos, tipos y lint |

No se reemplazaron Discord.js, Fastify ni pg. No se borró ningún SQL histórico ni se inventaron asociaciones antiguas. La tabla 014 empieza vacía y solo conserva cambios observados desde el rework.

## Módulos originales

| Funcionalidad | Implementación original | Nueva ubicación | Pruebas / comprobaciones | Estado |
|---|---|---|---|---|
| Borradores, programación, plantillas y publicaciones | src/admin-announcements.ts | apps/core/src/admin-announcements.ts | admin-lifecycle; E2E anuncios; web-contracts | Migrado y verificado según pruebas indicadas |
| Registros financieros, suscripciones e historial | src/admin-billing.ts | apps/core/src/admin-billing.ts | admin-lifecycle; E2E finanzas (crear/editar exacto) | Migrado y verificado según pruebas indicadas |
| Guías versionadas, restauración y vínculos | src/admin-guides.ts | apps/core/src/admin-guides.ts | admin-lifecycle; E2E guías (crear/editar/revisiones/archivo) | Migrado y verificado según pruebas indicadas |
| Auditoría persistente de acciones | src/audit.ts | apps/core/src/audit.ts | admin-lifecycle; E2E; contrato HTTP | Migrado y verificado según pruebas indicadas |
| Snapshots, comparación y descargas | src/auditor-routes.ts | apps/core/src/auditor-routes.ts | openapi-contract; web-contracts | Migrado y verificado según pruebas indicadas |
| Captura estructural solo lectura | src/auditor.ts | apps/core/src/auditor.ts | auditor.test; openapi-contract | Migrado y verificado según pruebas indicadas |
| OAuth, sesiones, CSRF y membresía viva | src/auth.ts | apps/core/src/auth.ts | auth-session; auth-csrf; E2E OAuth/revocación | Migrado y verificado según pruebas indicadas |
| Reglas cerradas, jobs y notificaciones | src/automations.ts | apps/core/src/automations.ts | admin-lifecycle; web-contracts | Migrado y verificado según pruebas indicadas |
| Entorno privado y validación | src/config.ts | packages/config/src/index.ts | security; typecheck | Migrado y verificado según pruebas indicadas |
| Pool, schema readiness y transacciones | src/db.ts | packages/database/src/index.ts | postgres-integration; migration-upgrade | Migrado y verificado según pruebas indicadas |
| Cuatro slash commands y publicación autorizada | src/discord.ts | apps/core/src/discord.ts | discord-commands; channel-permissions; build | Preservado; Gateway real pendiente |
| Agrupación de commits y evidencia de publicación | src/github-batches.ts | apps/core/src/github-batches.ts | github-commit-lifecycle; postgres-integration | Migrado y verificado según pruebas indicadas |
| Tags, SHAs y procedencia de releases | src/github-releases.ts | apps/core/src/github-releases.ts | github-release-provenance | Migrado y verificado según pruebas indicadas |
| Lectura de commits y releases | src/github-routes.ts | apps/core/src/github-routes.ts | web-contracts; openapi-contract | Migrado y verificado según pruebas indicadas |
| Webhook, paginación GitHub y cursores CAS | src/github.ts | apps/core/src/github.ts | github-integration; github-commit-lifecycle; security | Migrado y verificado según pruebas indicadas |
| API, permisos y rutas principales | src/http.ts | apps/core/src/http.ts | http; auth-session; admin-lifecycle; E2E | Migrado y verificado según pruebas indicadas |
| Inventario de guild, roles y destinos autorizados | src/ids.ts | packages/shared/src/ids.ts | channel-permissions; web-contracts; discord-commands | Migrado y verificado según pruebas indicadas |
| Fuentes, cobertura e imports administrables | src/index-routes.ts | apps/core/src/index-routes.ts | import-recovery; web-contracts; openapi-contract | Migrado y verificado según pruebas indicadas |
| Boot y señales de cierre | src/index.ts | apps/core/src/index.ts | typecheck/build; arranque real pendiente | Preservado; boot real pendiente |
| Intentos, cancelación y conciliación | src/job-admin.ts | apps/core/src/job-admin.ts | github-commit-lifecycle; postgres-integration; web-contracts | Migrado y verificado según pruebas indicadas |
| Outbox, publicación, backoff y sweep | src/jobs.ts | apps/core/src/jobs.ts | postgres-integration; web-contracts (drain/revocación) | Migrado y verificado según pruebas indicadas |
| Migraciones versionadas | src/migrate.ts | packages/database/src/migrate.ts | migration-upgrade; test:integration; dos ejecuciones | Migrado y verificado según pruebas indicadas |
| Estadísticas, exportación y diagnósticos | src/observability.ts | apps/core/src/observability.ts | E2E overview; web-contracts; openapi-contract | Migrado y verificado según pruebas indicadas |
| Contrato HTTP versionado | src/openapi.ts | apps/core/src/openapi.ts | openapi-contract; web-contracts | Migrado y verificado según pruebas indicadas |
| Permisos efectivos de canal/foro | src/permissions.ts | apps/core/src/permissions.ts | channel-permissions; auth-session | Migrado y verificado según pruebas indicadas |
| Embeds y prevención de menciones masivas | src/presentation.ts | apps/core/src/presentation.ts | admin-lifecycle; E2E embeds; visualSchema | Migrado y verificado según pruebas indicadas |
| Importación histórica, leases y checkpoint | src/report-import.ts | apps/core/src/report-import.ts | import-recovery | Migrado y verificado según pruebas indicadas |
| Eventos de captura y conservación de borrados | src/report-index.ts | apps/core/src/report-index.ts | postgres-integration; github-integration | Migrado y verificado según pruebas indicadas |
| Creación de reportes idempotentes | src/reports.ts | apps/core/src/reports.ts | postgres-integration; E2E reportes | Migrado y verificado según pruebas indicadas |
| Lectura acotada de miembros actuales | src/staff.ts | apps/core/src/staff.ts | web-contracts (aprobación/autoasignación); typecheck | Migrado y verificado según pruebas indicadas |

## Funcionalidad nueva

| Incorporación | Ubicación | Verificación |
|---|---|---|
| Shell, tablas, formularios y vistas reales | apps/web/components + lib/modules.ts | E2E y web-contracts |
| Sesión en servidor y BFF de origen único | apps/web/lib/session.ts y proxy.ts | OAuth E2E, cookies, Origin, CSRF, rutas y límite de cuerpo |
| Constructor de embeds y plantillas aplicables | components/embed-editor.tsx | Zod compartido y E2E anuncio |
| Preferencias locales y tabla configurable | components/studio.tsx | E2E persistencia, modo oscuro, acento y viewport móvil |
| Monitoreo/conciliación e índice web | Módulos jobs/audit/automations | Contratos con rutas reales y suite Core |
| Conservación del histórico SQL y upgrade de datos | tests/migration-upgrade.test.ts | Hashes 001–013 y upgrade 0.3→0.4 dos veces |

Los tests de contrato prueban existencia y métodos de rutas; no se presentan como prueba de todas las combinaciones de interacción de cada pantalla. La suite E2E cubre los flujos representativos indicados en TESTING.md. Gateway real, despliegue alojado y Docker completo quedan explícitamente fuera de las verificaciones locales realizadas.
