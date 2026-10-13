# Recuperación operativa y conciliación — 0.3.0

## Estados y transiciones

automation_jobs: queued -> running -> done; fallos previos a I/O remoto pueden reprogramarse con backoff; después de iniciar publicación Discord, los fallos ambiguos pasan a needs_reconciliation. Los jobs también pueden terminar failed o cancelled. Cada intento se audita en job_attempts.

La transacción SQL no permanece abierta durante la petición a Discord. El worker reclama atómicamente y guarda resultado remoto con el estado del dominio y las asociaciones GitHub cuando es posible.

## GitHub

Los SHA detectados se guardan en github_commits. La asignación a reporte aparece en github_report_commits, pero NO marca reported_at. Si falla Discord, los SHA siguen vinculados a un reporte pendiente o ambiguo. Solo el éxito confirmado o enlace remoto ADMIN verificado establece reported_at. Si se cancela definitivamente un reporte no publicado, sus SHA pasan de nuevo al conjunto asignable; no se pierden silenciosamente.

## Resolver publicaciones ambiguas

API ADMIN:
- GET /api/v1/jobs con filtro status, GET /api/v1/jobs/{id} para intentos.
- POST /api/v1/jobs/{id}/reconcile con action=link, channelId, messageId y motivo. Comprueba bot autor, Guild, canal/foro y marca STUDIO-REPORT, STUDIO-ANNOUNCEMENT o STUDIO-GUIDE; nunca confiar en texto enviado por frontend.
- action=retry exige confirmRemoteAbsent=true, motivo y máximo de intentos; existe riesgo de duplicación residual.
- action=cancel anula un trabajo incierto mediante ADMIN y registra su razón. Cancelación queued disponible también por /api/v1/jobs/{id}/cancel.

No marcar como hecho si la operación remota pudo haberse ejecutado y no hay prueba. Exactamente-una-vez entre Discord y PostgreSQL no puede prometerse.

## Importaciones

Cada report_import_run mantiene cursor, phase, processed, errors, lease_token y lease_expires_at. La misma transacción que confirma progreso programa el siguiente lote. En caso de crash, recoverOrphanedImports reconstruye un trabajo de continuación para ejecuciones huérfanas autorizadas, o las pausa si la fuente dejó de estar habilitada. API: POST /api/v1/report-index/imports/recover, /{id}/pause, /{id}/resume, /{id}/cancel.

El dry-run no inserta reportes ni envía mensajes; una importación real requiere fuente habilitada y permisos Discord correctos.

## Manual del operador

1. Inspeccionar /api/v1/diagnostics y /api/v1/jobs/metrics.
2. Filtrar needs_reconciliation, comprobar destino, marcador, último error e intentos.
3. Confirmar ID Discord remoto antes de action=link, o documentar ausencia antes de retry.
4. Inspeccionar importaciones paused/running y su lease, recuperar huérfanas por API.
5. Si la fuente GitHub fue desactivada, nunca forzar su publicación; revisar trabajos ya en vuelo.
6. Mantener backup y auditar motivos de todas las decisiones ADMIN.
