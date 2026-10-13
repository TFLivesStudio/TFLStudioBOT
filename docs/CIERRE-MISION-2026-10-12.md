# TFL STUDIO CORE / INFORME DE CORRECCIÓN Y CONSOLIDACIÓN

Fecha: 12 de octubre de 2026
Base auditada: 3498997807b13723f28edd03954773e61a278337
Estado: desarrollo y pruebas controladas. NO desplegado en producción. V1 NO completada.

Este informe describe resultados verificables y pendientes. Una CI verde no sustituye pruebas contra Discord de producción ni significa que todos los requisitos estén concluidos.

## Matriz de misión

| Capítulo | Problema anterior / causa | Cambio y evidencia | Estado real |
|---|---|---|---|
| 02 Permisos | Se exigía CreatePublicThreads para crear posts en foros; lógica duplicada en slash/API | permissions.ts unifica ViewChannel, SendMessages, SendMessagesInThreads, overwrites y roles actuales; discord.ts delega en servicio. Tests de foros y denegaciones | IMPLEMENTADO / PRUEBAS UNITARIAS, falta entorno real |
| 03 Reportes nuevos | Mensajes manuales no aparecían en BD | report-index.ts observa eventos de mensajes e hilos; fuentes autorizadas por API, metadatos y tombstones, anti-duplicados por Discord ID | PARCIAL; no capturado en servidor real |
| 03 Histórico | Sin importación ni recuperación | report-import.ts agrega fases, lotes, cursor, dry-run, pausa, reanudación y API de progreso | PARCIAL; no garantizada cobertura total de archivos/hilos inaccesibles |
| 04 GitHub | Webhook truncable, comparaciones de 100, rama implícita | github.ts valida HMAC, rama configurada, recorre páginas completas, cursor CAS y jobs; pruebas de más de 100 commits | IMPLEMENTADO CON LIMITACIONES de fuerza/paginación máxima y sin prueba externa real |
| 04 Releases | Separación base sin política de cobertura | Releases con changelog propio, prereleases configurables, integración fuente ADMIN desactivada por defecto | PARCIAL; solapamientos entre changelog y SHAs no asociados exhaustivamente |
| 05 Outbox | Publicación HTTP a Discord dentro de transacción SQL | reports.ts guarda intención + trabajo atómicamente; jobs.ts libera transacción antes de red, logs de intentos y estado ambiguo | IMPLEMENTADO / TEST POSTGRESQL, reconciliación humana |
| 05 Recuperación | needs_reconciliation sin mecanismo | job-admin.ts expone detalle, intentos, enlace verificado, cancelación y retry explícito ADMIN | IMPLEMENTADO / PRUEBAS DE TRANSICIONES PARCIALES |
| 06 CSRF/OAuth | /auth/me rotaba token CSRF, rompiendo pestañas | auth.ts deriva HMAC estable por sesión, cookie SameSite=Lax, verificación de membresía viva y role changes | IMPLEMENTADO / TEST HTTP CON MOCK, falta OAuth con proveedor real |
| 06 API privada | Acceso por rol insuficiente para reportes específicos | Autorización por recurso y canal, sesión ADMIN para Billing, auditor, personal y GitHub | IMPLEMENTADO CON COBERTURA PARCIAL |
| 07 Auditor | /recopilar era muy incompleto | auditor.ts amplía canales, roles, AutoMod, onboarding, foros, hilos, emojis y estados de consulta; exportaciones y snapshots ADMIN, comparación | PARCIAL; algunas secciones pueden no estar disponibles por API o permisos |
| 08 Pruebas | Solo 5 tests, sin simulaciones de fallos | PostgreSQL real en CI, test de concurrencia, CSRF, GitHub, auditor y migraciones idempotentes | AMPLIADO; faltan escenarios de extremo a extremo y carga |
| 09 Anuncios | Programación básica | Mantiene plantillas, embeds, outbox y marca de reconciliación | PARCIAL: edición completa, cancelación/versionado y componentes avanzados pendientes |
| 09 Guías | Listado y ediciones | Versiones transaccionales y control de conflictos previo conservados | PARCIAL: búsqueda completa y sincronización con foro pendientes |
| 09 Personal | Directorio parcial | Sigue lectura ADMIN y asignaciones internas sin otorgar roles Discord | PARCIAL: ciclo de vida administrativo por definir |
| 09 Billing | Alta y suscripciones | Mantiene aislamiento ADMIN y registros declarados, sin pasarelas de pagos | PARCIAL: edición completa e historial detallado pendientes |
| 09 Estadísticas | BD interpretada como historia total | API marca origen y alcance de los registros | PARCIAL: métricas históricas completas pendientes |
| 10 Arquitectura | HTTP monolítico grande | Se agregaron módulos aislados de auditor/indexación/jobs/permisos; API-first conservada | PARCIAL: separar todo http.ts sigue pendiente |
| 11 OpenAPI | Contratos limitados | Nuevas rutas de índices, jobs, auditoría y GitHub agregadas; schemas de petición y errores | PARCIAL: respuestas JSON y ejemplos exhaustivos pendientes |
| 12 Producción | No había despliegue validado | Ninguna escritura de producción; integración TFL Client sigue desactivada | BLOQUEADO POR AUTORIZACIÓN explícita e infraestructura |

## Verificación reproducible

Workflow CI en .github/workflows/ci.yml: npm ci, TypeScript estricto, aplicación de migraciones en PostgreSQL 16 (dos ejecuciones), pruebas unitarias/de integración y build.

Pruebas nuevas cubren: SendMessages para foros, sobrescrituras, rol ADMIN, membresía pendiente/expulsada, sesión revocada, CSRF multitaba, firma GitHub, comparaciones paginadas, webhook duplicado, outbox concurrente, anti-duplicación de mensajes, eliminación lógica, rollback, publicación remota ambigua y comparación estructural.

Verificar el estado exacto del último commit en GitHub Actions; la documentación no declara de antemano verde una ejecución futura.

## Riesgos bloqueantes para V1 de producción

1. Falta validación real con cuentas restringidas, GuildForum, los ocho destinos y permisos efectivos del propio bot.
2. Captura histórica puede ser parcial por archivos, hilos inaccesibles, marcas temporales idénticas o rate limits; debe emitirse informe de cobertura.
3. En una pérdida de red tras publicar, la reconciliación manual sigue siendo necesaria.
4. El historial de un release y sus commits aún no usa una asociación verificable completa de tags/SHAs.
5. Aún no existe política aprobada de retención y eliminación de material interno.
6. Auditor no garantiza obtener todos los campos del Auditor previo cuando Discord deniega las consultas.
7. Módulos de anuncios, guías, Billing, estadísticas y automatizaciones requieren funcionalidades adicionales.
8. No se ha ejecutado un test real de OAuth, webhooks de GitHub o publicación Discord en entorno controlado.

## Invariantes conservados

Guild privado, aprobación humana, ADMIN autoridad global, Studio sin atribuciones administrativas, sin frontend, sin modificaciones de canales/roles, sin credenciales reales y sin integración productiva activada.
