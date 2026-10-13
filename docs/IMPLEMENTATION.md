# TFL STUDIO CORE — ESTADO 0.3.0

**Fase:** consolidación funcional y preparación para ensayos operativos. NO V1 de producción.

## Implementado

- Ciclo transaccional para lotes de commits GitHub: detección, SHA/reporte, outbox, confirmación remota y conciliación. reportado no significa meramente encolado.
- Importaciones históricas con lease por ejecución, siguiente job + checkpoint atómicos, recuperación de huérfanos, dry-run, pausa y API ADMIN.
- Reportes del bot, manuales y GitHub con clasificación por fuente/proyecto, estado de sincronización, eventos de edición/eliminación y permisos vivos. Historial puede ser parcial.
- Anuncios: borradores, edición por versión, duplicación, templates, validación de embeds y URL, programación/reprogramación/cancelación, publicar ahora explícitamente, logs y outbox.
- Guías: lectura por visibilidad, versiones/revisiones, restaurar, archivar, vincular y publicar en foro autorizado, estados de conflicto sin sobreescritura remota.
- Billing ADMIN: registros, suscripciones, vencimientos, filtros, versión esperada e historial transaccional before/after; aritmética exacta en unidades menores.
- Automatizaciones ADMIN: tipos cerrados y validados, intervalos y manual, estado inicial desactivado, ejecución idempotente, historial, avisos internos. Sin ejecución arbitraria de JS/SQL/shell.
- GitHub releases: SHA/tag y rangos cuando son verificables; edits y tag moves conservan incertidumbre.
- Diagnósticos, heartbeats, métricas y exportaciones protegidas. OpenAPI 0.3 para dashboard independiente.

## Verificado mediante CI

Node 22, npm ci, TypeScript estricto, PostgreSQL 16 de pruebas, 13 migraciones repetidas, simuladores de Discord/GitHub, pruebas de concurrencia, integridad de compromisos, importaciones huérfanas, acceso ADMIN, CSRF y módulos financieros. Consultar el enlace de CI del último commit y su reporte real; una CI verde no representa una prueba en el servidor Discord privado.

## Pendiente de validación real

- Discord OAuth2 real, token rotado, GuildForum con tags, permisos reales por canal, captura manual limitada, envío controlado y recuperación ante rate limits.
- Indexación de historia completa: archivos inaccesibles, hilos privados, fechas idénticas de archivos, movimientos de hilos, ediciones fuera de orden y borrados previos.
- Enlace/tag GitHub ante force push, repos renombrados y comparaciones truncadas imposibles; relación entre todas las releases históricas.
- Manual ADMIN de ediciones remotas de guías, ampliar historial de cambios del editor de anuncios, cancelación/coordinación de algunas automatizaciones ya en ejecución.
- Verificación externa de diseños de embeds (preview API JSON, no reproducción pixel-perfect del cliente Discord).
- Política de retención y limpieza de registros sensibles, observabilidad bajo carga, permisos mínimos del bot, backups restaurables y plan de rollback.
- La V1 requiere todavía ensayos operativos controlados autorizados, pruebas de seguridad independientes y aceptación funcional.

## Archivos y documentación

docs/ARCHITECTURE.md, docs/INDEXACION.md, docs/RECUPERACION.md, docs/GITHUB-INTEGRATION.md, docs/SEGURIDAD.md, docs/DEPLOY.md, docs/MIGRACIONES.md y docs/CIERRE-MISION-0.3.0.md.

En producción no se aplicaron migraciones, no se activó captura y no se publicó ningún mensaje.
