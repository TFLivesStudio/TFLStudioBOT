# Arquitectura 0.4.0

```text
apps/
  core/src/          Gateway, API, dominio, integraciones, worker y comandos
  web/app/          App Router, login, páginas protegidas y proxy HTTP
  web/components/   Shell Studio, vistas, formularios y UI Radix/CVA
  web/lib/          Módulos, transporte, sesión del servidor y proxy acotado
packages/
  shared/src/       Inventario público autorizado, sesión, reportes y embeds Zod
  database/src/     Pool pg, transacciones y runner de migraciones
  config/src/       Variables privadas del Core y validación del entorno
migrations/         001–013 intactas; 014 añade revisiones de anuncios
scripts/            Testing aislado, integración y benchmark
 tests/              Suite heredada, contratos, migración y E2E
```

Un único lockfile y workspaces con `workspace:*`. No se añadió un ORM, Redis, Turborepo ni un sistema alternativo de permisos. Los módulos del Core conservan responsabilidades identificables de 0.3; su matriz enumera cada archivo. Los reexports locales config/db/ids evitan reescribir las dependencias internas a la vez que centralizan sus implementaciones reales.

El navegador utiliza `/api/v1/*` en el origen web. El Route Handler de Next reenvía un subconjunto cerrado de rutas y cabeceras a CORE_INTERNAL_URL. El host de destino nunca lo elige el cliente. Core verifica sesión, membresía aprobada, rol, permisos efectivos, Origin y CSRF. Las páginas se autentican también en servidor; ocultar navegación no constituye autorización.

PUBLIC_API_URL en Core es el origen web público para el callback OAuth. CORE_INTERNAL_URL pertenece al servidor Next y apunta a la dirección real de Core. De esta forma web y Core pueden estar en infraestructuras distintas sin depender de cookies de terceros. El webhook GitHub va directamente a Core y no atraviesa el proxy web.

Core mantiene Gateway y worker dentro del mismo proceso Bun. Los trabajos usan la outbox SQL, reclamo atómico, registro de intentos, deduplicación y conciliación heredados. Ante SIGTERM/SIGINT deja de aceptar nuevas tandas y espera tareas activas antes de cerrar Discord y PostgreSQL. Antes de publicar acciones humanas vuelve a verificar al solicitante; las integraciones GitHub vuelven a comprobar su habilitación. Las barridas no se solapan.

Next usa Server Components para verificar sesión y páginas; las tablas y formularios interactivos son Client Components. El editor de embeds se carga de forma diferida. Las consultas independientes del overview salen en paralelo. No se cachean sesiones, respuestas administrativas ni roles entre peticiones. Se mantienen límites de página; la caché privada de preferencias no incluye datos administrativos.

Las claves de infraestructura no forman parte de shared ni de respuestas al cliente. El inventario Discord compartido son IDs públicos de recursos, no capacidades de acceso. El navegador no importa config, database ni módulos privados del Core.
