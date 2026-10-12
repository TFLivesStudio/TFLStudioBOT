# TFL STUDIO / NOTAS DE IMPLEMENTACIÓN

## Alcance de la primera entrega

**Operativo a nivel de implementación:** arranque, configuración, esquema transaccional, OAuth, roles vivos, API para datos administrativos, publicación por canal/foro, jobs, GitHub firmado, registro de cambios. Las integraciones reales no han sido ejecutadas.

**Pendiente:** importación/indexación de publicaciones históricas, editor visual de embeds y componentes avanzados, plantillas reutilizables, ediciones versionadas de guías, dashboard, pruebas de integración contra Discord/GitHub, polling de commits para casos sin webhook, métricas completas, observabilidad extendida.

## Política de migración

Migraciones en \`migrations/\`, aplicadas transaccionalmente por \`npm run migrate\`. Mantener backups del PostgreSQL y una reversión supervisada para futuros cambios. No ejecutar migraciones sobre producción sin backup.

## Autorización

\`ADMIN\` = \`1282541815802892289\`. Ámbitos no administrativos vinculados a roles reales (Minecraft, Websites, Hosting, Publicidad, etc.); la asignación interna en BD **no concede** un rol de Discord. El proceso nativo de aprobación humana es externo y se conserva.

## Datos y privacidad

Tablas: \`sessions\`, \`audit_events\`, \`reports\`, \`publication_records\`, \`guides\`, \`announcements\`, \`staff_assignments\`, \`billing_records\`, \`github_sources\`, \`github_commits\`, \`webhook_deliveries\`, \`automation_jobs\`. Respaldos, retención de eventos, derecho de eliminación y políticas de acceso deben definirse antes del tratamiento de datos reales.

## Publicación GitHub

\`github_push_summary\`: ventana configurable, máximo 25 commits por reporte, evita generar un mensaje por commit. \`github_release\`: evento independiente, publicación al siguiente ciclo de workers. Los jobs interrumpidos y fallos en publicaciones pueden pasar a \`needs_reconciliation\` para evitar reintentos inseguros.

## Deuda técnica explícita

1. Reconciliación manual automatizable de mensajes Discord ante fallo parcial.
2. Pruebas de combinaciones complejas de permisos en canales/foros y gestión de rate limits de autorización.
3. Índice de histórico desde canales y foros y esquema de cobertura \`completo/parcial/desconocido\`.
4. OpenAPI ampliado con request/response schemas y ejemplos.
5. Pruebas con PostgreSQL/Discord simulados y validación de build/TypeScript.
