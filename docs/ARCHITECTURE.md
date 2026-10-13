# Arquitectura TFL Studio Core — 0.3.0

## Alcance

Monolito modular Node.js LTS + TypeScript estricto + discord.js + Fastify + PostgreSQL. Un mismo proceso gestiona Gateway, API privada versionada y worker. El dashboard futuro vive fuera del repositorio en Vercel y consume la API. El bot solo opera en Guild 1264656310205415474.

ADMIN 1282541815802892289 es autoridad global. Studio y los roles departamentales no administran todo el Studio. La aprobación humana nativa permanece inalterada.

## Separación de responsabilidades

| Código | Responsabilidad |
|---|---|
| auth.ts / permissions.ts | OAuth2, sesión, CSRF y permisos vivos por recurso/canal |
| discord.ts / presentation.ts | Comandos, eventos Gateway, visuales y envío seguro |
| reports.ts / github-batches.ts | Intención de publicación transaccional y relación persistente commit-reporte |
| report-index.ts / report-import.ts / index-routes.ts | Captura opt-in, paginación, checkpoints, leases, recuperación y API |
| github.ts / github-releases.ts / github-routes.ts | Webhooks HMAC, cursores CAS, releases/tags/SHAs, lectura ADMIN |
| jobs.ts / job-admin.ts | Worker, backoff, reclamo atómico, reconciliación y registro de intentos |
| admin-announcements.ts | Borradores, versionado, programación, plantillas y cancelación |
| admin-guides.ts | Guías versionadas, restauración, visibilidad y sincronización con foro |
| admin-billing.ts | Registros y suscripciones con historial antes/después |
| automations.ts | Definiciones de reglas cerradas, programación y avisos internos |
| observability.ts | Estadísticas segmentadas, diagnóstico, exportaciones |
| auditor.ts / auditor-routes.ts | Inventario estructural protegido |
| http.ts / openapi.ts | Enrutamiento restante y contrato HTTP |
| db.ts / migrate.ts | Pool, transacciones y migraciones |

## Integridad externa

Al crear reporte se inserta en PostgreSQL el registro y trabajo de publicación dentro de una transacción. El worker reclama trabajos con FOR UPDATE SKIP LOCKED y termina la transacción antes de red. Mensajes Discord no son parte de una transacción SQL: ante resultado remoto incierto, necesita conciliación ADMIN.

Los commits GitHub permanecen en github_commits; una asignación en github_report_commits relaciona cada SHA con un reporte. reported_at no se establece hasta que el ID remoto ha sido verificado y persistido. Cancelaciones definitivas liberan asociaciones no publicadas para posteriores lotes sin pérdida silenciosa. Legacy sin evidencia queda señalado, nunca asumido completo.

Las importaciones guardan progreso y siguiente job en una misma transacción, usan lease por ejecución y un reconciliador de huérfanos. Un worker duplicado no puede reclamar la misma fuente simultáneamente. Importar contenido de Discord solo está permitido en fuentes habilitadas, con MessageContent opt-in.

## Limites

No existe exactamente-una-vez universal entre servicios. La captura histórica puede ser parcial; tags movidos, comparaciones incompletas y mensajes ya borrados se marcan como desconocidos. La API está diseñada para el dashboard, no pretende renderizar en píxeles una vista idéntica al cliente Discord. Ninguna integración está habilitada por defecto. No se realizó prueba operativa en el servidor real.
