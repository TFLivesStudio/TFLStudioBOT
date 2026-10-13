# CHANGELOG

## 0.3.0 — Consolidación funcional, octubre 2026

- Ciclo transaccional de commits GitHub: cada SHA queda asociado a un reporte; solo se confirma después de la publicación real o reconciliación comprobada. Cancelación libera las asignaciones.
- Importaciones con leases, checkpoints y próximo job atómicos, dry-run, reanudación y recuperación de huérfanos.
- Indexación Discord reforzada: ediciones, eventos parciales, duplicados, eliminación, estados de hilos, vinculaciones del bot.
- Administración de anuncios: versiones, edición, duplicación, plantillas, programación, reprogramación, cancelación, publicación por outbox y reconciliación.
- Guías: historial/restauración, control de versiones, archivado, vínculo y publicación a foro autorizado.
- Billing: registros y suscripciones editables, historial administrativo, precisión de unidades menores y clasificación por moneda sin FX.
- Automatizaciones tipadas configurables y opt-in, trabajos programados y avisos internos.
- Relación de releases con tags, SHAs y rangos verificables; anomalías por tags movidos o notas editadas.
- Diagnóstico del backend, estados de jobs e importaciones, estadísticas por origen y OpenAPI.
- Suite reforzada con PostgreSQL 16, pruebas de concurrencia, fallos SQL y contratos.

No desplegada; siguen pendientes ensayos contra servicios reales, políticas de retención y completitud de algunos escenarios.

## 0.2.0

Ver docs/CIERRE-MISION-2026-10-12.md.
