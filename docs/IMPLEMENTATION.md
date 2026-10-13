# TFL STUDIO CORE / ESTADO DE IMPLEMENTACIÓN

**Versión:** 0.2.0 en desarrollo. No es la V1 final ni está desplegada en producción.

## Implementación existente

- Autorización compartida entre comandos y API, incluyendo permisos efectivos de canales y rol ADMIN.
- OAuth2, sesiones HttpOnly, token CSRF estable por sesión y verificación actual de membresía.
- Reportes manuales con outbox, deduplicación y conciliación de operaciones ambiguas.
- Captura opt-in de reportes de canales y foros; importación histórica por lotes con dry-run, checkpoints y estado visible.
- Integraciones GitHub mediante HMAC, ramas configurables, comparaciones paginadas, cursor transaccional y releases separadas.
- Guías versionadas, registros de publicidad, anuncios básicos programados, asignaciones ADMIN y registros Billing.
- Auditor estructural ampliado, snapshots privados, descargas y comparación de inventarios.
- API versionada para el futuro dashboard independiente, documentada parcialmente mediante OpenAPI.

## Verificación

GitHub Actions instala dependencias con npm ci y package-lock, comprueba tipado estricto, ejecuta migraciones repetidamente sobre PostgreSQL 16 de prueba, corre pruebas automatizadas de seguridad/integridad/concurrencia y compila. Esto **no** certifica un funcionamiento real con Discord/GitHub.

## Funcionalidad incompleta

- Cobertura histórica exhaustiva: los hilos inaccesibles, mensajes previamente borrados, archivos privados, limitaciones de permisos y marcadores temporales pueden causar resultados parciales.
- Pruebas de integración productiva: OAuth real, permisos reales, indexación real y envío a Discord/GitHub controlado.
- Reconciliación automatizada sin falsos positivos en todos los casos externos (se mantiene revisión humana).
- Vinculación exacta del rango de SHAs de cada release con sus resúmenes de desarrollo.
- Editor avanzado de anuncios y componentes, edición/cancelación integral e historial detallado.
- Sincronización de guías con foros, gestión completa de Billing y personal, y sistema genérico de reglas de automatización.
- Separación adicional de rutas de http.ts, contrato OpenAPI completo por recurso y política de retención.
- Observabilidad, análisis estático y pruebas de carga más completos.

## Fuentes de continuidad

Consultar docs/ARCHITECTURE.md, docs/SEGURIDAD.md, docs/GITHUB-INTEGRATION.md, docs/INDEXACION.md, docs/RECUPERACION.md, docs/MIGRACIONES.md y docs/CIERRE-MISION-2026-10-12.md.

## Migración

Hay ocho migraciones versionadas. No alterar las aplicadas ni ejecutar contra la BD productiva sin backup, pruebas de staging y autorización específica.
