# TFL STUDIO CORE / ARQUITECTURA

Monolito modular API-first: Node.js LTS, TypeScript, discord.js, Fastify, PostgreSQL. Bot Discord, API HTTP y worker viven en el mismo backend. NO hay dashboard integrado: el futuro frontend de Vercel utilizará OAuth2 y la API versionada.

## Principios vinculantes

- Guild exclusivo: 1264656310205415474.
- ADMIN (1282541815802892289) es la autoridad administrativa global.
- Studio no es ADMIN; los roles departamentales solo habilitan funciones concretas.
- Ingreso exclusivamente mediante aprobación humana nativa.
- Ninguna función cambia canales, categorías, roles u onboarding existentes.
- El índice de mensajes no incorpora departamentos sensibles y está desactivado al instalar.

## Flujos

1. OAuth2 identifica al usuario y verifica membresía real y estado pending.
2. API y slash commands aplican la misma política de roles, sobrescrituras y permisos efectivos de destino.
3. Las escrituras a Discord entran en PostgreSQL como intención y outbox transaccional.
4. Un worker reclama trabajos sin mantener abierta una transacción durante peticiones de red.
5. Las publicaciones ambiguas requieren conciliación ADMIN; hay marcas de correlación verificables.
6. GitHub mantiene flujos diferenciados de commits agrupados y releases oficiales.

## Módulos

- auth.ts / permissions.ts: sesiones, CSRF y autorización
- discord.ts / reports.ts: comandos e intenciones de publicación
- report-index.ts / report-import.ts / index-routes.ts: metadatos, índices e importación
- github.ts: webhooks firmados, paginación y recuperación de commits
- jobs.ts / job-admin.ts: outbox y resolución de errores
- auditor.ts / auditor-routes.ts: inventario estructural privado
- http.ts / openapi.ts: rutas y contratos del backend
- db.ts / migrate.ts: PostgreSQL y migraciones

## Garantías y límites

No existe transacción distribuida entre Discord y PostgreSQL. Se priorizan idempotencia, estados observables, bloqueos de reclamación cortos y conciliación humana ante resultados remotos desconocidos. Los datos capturados no prueban necesariamente el historial completo de Discord. El arranque necesita credenciales y acceso a infraestructura, y no ha sido verificado contra producción.
