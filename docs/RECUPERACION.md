# RECUPERACIÓN DE TRABAJOS / ADMIN

Estados: queued, running, done, failed, needs_reconciliation y cancelled. Hay una tabla persistente de intentos. La llamada a Discord ocurre después de registrar la intención en PostgreSQL y fuera de la transacción.

## API

GET /api/v1/jobs?status=needs_reconciliation
GET /api/v1/jobs/:id
POST /api/v1/jobs/:id/reconcile
POST /api/v1/jobs/:id/cancel

## Conciliación

1. Examinar trabajo, intento, destino, correlation y error.
2. Comprobar en Discord si existe el mensaje con Ref: STUDIO-REPORT-ID o Ref: STUDIO-ANNOUNCEMENT-ID.
3. Si existe, enviar action=link con channelId, messageId y reason. La API verifica Guild, autor del bot, destino y marca antes de cerrar el trabajo.
4. Si se confirma la ausencia del mensaje, enviar action=retry con confirmRemoteAbsent=true y una razón clara. La repetición admite riesgo residual.
5. Cancelar si corresponde y registrar el motivo.

El worker nunca repite automáticamente una publicación cuyo resultado remoto sea ambiguo. Las ejecuciones detenidas se marcan para conciliación; no se edita directamente PostgreSQL para operaciones normales. No se garantiza exactamente-una-vez.
