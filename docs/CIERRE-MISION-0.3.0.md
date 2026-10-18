> Archivo histórico de 0.3. Para el monorepo actual consultar [README](../README.md) y [matriz del rework](REWORK_TRACEABILITY.md).

# TFL STUDIO CORE 0.3.0 — INFORME TÉCNICO DE CIERRE

**Fecha:** 13 de octubre de 2026 UTC (12 de octubre en Colombia).  
**Base revisada:** 357814482e158ae40592ba9965da34e235751a8e (0.2.0).  
**Entrega:** 0.3.0 en main, con pruebas CI y documentación. No V1, no despliegue productivo.

## Matriz de requisitos y evidencias

| Área | Problema / causa raíz | Solución real y archivos | Migraciones | Pruebas y evidencia | Estado |
|---|---|---|---|---|---|
| 02 GitHub commits | reported_at se establecía al crear el outbox, antes de publicar | github-batches.ts asigna SHAs al reporte dentro de transacción; jobs.ts confirma al persistir ID remoto; job-admin.ts reconcilia y libera lotes cancelados | 009 | github-commit-lifecycle.test.ts prueba 25 SHAs, concurrencia, fallo remoto SQL, conciliación y cancelación | Implementado; integración remota pendiente |
| 03 Importaciones | Progreso podía confirmarse sin nuevo job; running huérfano | report-import.ts guarda checkpoint y siguiente job atómicamente; lease y recuperación; index-routes.ts pausa/reanuda/cancela/recupera | 010 | import-recovery.test.ts con PostgreSQL, dry-run, reinicio, fuente deshabilitada y cursor | Implementado; histórico real parcial |
| 04 Reportes | Fuentes manuales/bot/GitHub podían duplicarse o desactualizarse | report-index.ts correlaciona bot, resuelve IDs, versionado temporal, hilos y tombstones; http.ts filtra por autor, proyecto, origen, estados y fechas; observability.ts exporta ADMIN | 013 | postgres-integration.test.ts, pruebas de borrado/dedup y fallos | Implementado parcialmente |
| 05 Anuncios | Sin edición/reprogramación/ciclo de vida completo | admin-announcements.ts añade CRUD operativo seguro, versión optimista, borradores, preview JSON, plantillas, duplicación, programación y cancelación; presentation.ts valida URLs/embeds; jobs.ts y job-admin.ts hacen outbox | 011 | admin-lifecycle.test.ts sobre Fastify/PostgreSQL | Implementado y probado localmente; Discord real pendiente |
| 06 Guías | Falta restaurar/archivar/vincular y resolver conflictos | admin-guides.ts: versiones, revisiones, restore CAS, búsqueda/visibilidad, enlazar hilo verificado y enviar por cola con correlación | 011 | admin-lifecycle.test.ts versiones y conflicto | Implementado parcialmente; edición remota pendiente |
| 07 Billing | Editar valores sobrescribía sin historia completa | admin-billing.ts: registros y suscripciones con historial transaccional before/after, filtros, vencimientos y agrupación exacta por moneda | 011 | admin-lifecycle.test.ts create/update, stale writer, historia y COP/USD | Implementado y probado en PG |
| 08 Automatizaciones | Solo trabajos codificados manualmente | automations.ts: definiciones cerradas, opt-in, trigger manual/intervalo, roles ADMIN, aviso interno, ejecución y seguimiento; sin ejecutar código arbitrario | 011 | admin-lifecycle.test.ts opt-in y duplicación de run | Implementado parcialmente (concurrencia extensa pendiente) |
| 09 GitHub releases | No había relación demostrable con SHAs/tags ni cambios | github-releases.ts almacena tag referencia, SHA immutable, rango de comparación, anomalías moved/edited; github-routes.ts presenta evidencia | 012 | github-release-provenance.test.ts GitHub simulado + PG | Implementado parcialmente; casos GitHub reales pendientes |
| 10 Observabilidad | Stats contaban BD sin cobertura; sin salud de workers | observability.ts aporta diagnóstico ADMIN, latidos, jobs, importaciones, estados de integraciones, stats por origen/ámbito y CSV protegido | 013 | pruebas HTTP y CI; falta carga real | Parcial |
| 11 Arquitectura/API | http.ts concentraba rutas; contrato OpenAPI obsoleto | rutas independientes para anuncios, guías, Billing, automations, telemetry y GitHub; openapi.ts 0.3 ampliado | Ninguna adicional | openapi-contract.test.ts comprueba rutas/seguridad y tests HTTP | Parcial, mantener refactor gradual |
| 12 Pruebas/CI | Cobertura 0.2 limitada | 13 migraciones idempotentes en PG16, tests concurrencia, GitHub, imports, administración, contratos; build TypeScript y npm ci | 009-013 | Ver GitHub Actions del commit final | Implementado CI, no certificación real |
| 13 Documentación | Faltaba guía completa FeatherPanel y continuidad 0.3 | README, CHANGELOG, docs/DEPLOY, ARCHITECTURE, RECUPERACION, INDEXACION, GITHUB-INTEGRATION, SEGURIDAD, MIGRACIONES, IMPLEMENTATION, este documento | Documentadas 13 | Validación manual y CI | Implementado |
| 16 Ensayo controlado | Despliegue real aún no autorizado | docs/DEPLOY detalla runtime, main file, OAuth, intents, permisos, 8 pasos de ensayo, rollback y desactivación | No aplicadas en producción | Sin ensayos de producción por prohibición expresa | Bloqueado a nueva autorización |

## Garantías observadas

- Un commit detectado no es equivalente a uno publicado: relación SHA/reporte recuperable, reported_at con confirmación remota.
- El historial Discord solo incluye eventos y fuentes habilitadas; el dashboard no puede tomar una cifra de PostgreSQL como censo total.
- La importación no debería quedar running sin lease recuperable: se regeneran jobs y se respetan fuentes desactivadas.
- La aprobación humana, los roles, los canales y la identidad visual no se modificaron.
- Los cambios financieros no mezclan monedas y conservan historial.
- Automatizaciones opt-in por defecto y sin ejecución de scripts remotos.

## Riesgos importantes pendientes

1. No se ha verificado OAuth2 ni permisos de Discord con cuentas reales ni intent privilegiado.
2. No se ha ejecutado indexación real ni migrado datos reales de TFL Studio, y foros archivados pueden tener paginación incompleta.
3. Discord y PostgreSQL carecen de transacción distribuida; una petición remota ambigua necesita intervención ADMIN.
4. Algunos casos de race de worker e importación al detener proceso durante I/O no pueden certificarse sin fault injection adicional.
5. Releases con tag cambiado o commits inaccesibles se marcan en incertidumbre; no se fuerza una relación inventada.
6. Editor de guías con cambios remotos, cancelación de jobs ya running y estados de algunos módulos requieren validación extrema.
7. Se requiere política de retención, seguridad de backup/proxy/DB, revisión de secretos y pruebas operativas progresivas para V1.

## Evidencia técnica

GitHub Actions del commit 0.3.0 realiza npm ci, typecheck, migraciones 001-013 dos veces, suite Node/tsx y npm run build; no requiere claves reales ni conecta al Discord de producción. Los enlaces y el resultado de la ejecución final deben consultarse en Actions; una ejecución no concluida no se declara exitosa por anticipado.

**Estado:** consolidación 0.3.0 implementada con pruebas controladas; **V1 no certificada**.
