# GitHub / commits, releases y procedencia — 0.3.0

Fuente principal futura: TFLivesStudio/TFLClient, sembrada desactivada. No se ha configurado webhook real ni publicado en Discord.

## Desarrollo

HMAC-SHA256 valida el body original del webhook y delivery ID deduplica entregas. Pushes en rama configurada programan sincronización; commits se recuperan por páginas desde GitHub Compare con SHA y cursor CAS. Los límites de comparación, force pushes y cambios de rama registran incertidumbre y evitan avance silencioso.

github_report_commits asocia cada SHA a su resumen mediante transacción. El reporte y outbox quedan encolados sin marcar reported_at. Solo publicación Discord confirmada o conciliación con mensaje verificado marca su estado como publicado. Un lote cancelado libera commits no publicados para reagrupación. La agrupación prioriza baja saturación y conserva enlaces/SHAs del trabajo detectado.

## Releases

Flujo separado y sin esperar ventana de commits. Conserva versión, tag, fecha, título, changelog oficial, URL y prerelease si está habilitado. La relación github_release_records guarda SHA observado, SHA resuelto, referencia del tag, relación con release previa y estado de incertidumbre. github_release_commits guarda SHA que pertenecen al rango verificado, cuando GitHub permite demostrarlo. Un tag movido mantiene el SHA original y registra anomalía; ediciones de notas quedan en revisión y no reescriben automáticamente reportes ya publicados.

No se elimina un commit por similitud de texto. Si no existe referencia comprobable, ambos flujos mantienen sus propios registros y estado unknown/range_unavailable.

## API ADMIN

- GET/POST /api/v1/github/sources, PATCH /api/v1/github/sources/{id}, POST /api/v1/github/sources/{id}/sync
- GET /api/v1/github/commits (estado detected/assigned/published/ambiguous/legacy)
- GET /api/v1/github/releases y /api/v1/github/releases/{id}/commits
- GET /api/v1/jobs y API de reconciliación ante fallo remoto
- GET /api/v1/diagnostics para última sincronización, errores y brechas

## Limitaciones

Rango SHA solo verificable con tags accesibles y versión anterior conocida. Force pushes, tags privados, repos renombrados y webhooks perdidos pueden exigir intervención. Comparación muy extensa y paginación incompleta nunca se reportan como cobertura total. No hay integración de producción activa.
