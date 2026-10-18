# TFL Studio · Core + Dashboard

Plataforma interna de TFL Studio. Monorepo **Bun 1.4.3**, Discord.js, Fastify, PostgreSQL y Next.js 16.4.2 / React 19.3.1. Versión de revisión: **0.4.0**.

Core es un proceso persistente; web es una aplicación independiente. Comparten repositorio y contratos, nunca credenciales de Discord en el navegador. El servidor autorizado sigue siendo `1264656310205415474`; solo el rol ADMIN `1282541815802892289` tiene autoridad global. Ningún código aprueba miembros ni reorganiza el servidor.

## Empezar

Requiere Bun 1.4.3 y PostgreSQL 16. Node.js 22 se utiliza únicamente para el runner de Playwright y sus herramientas de navegador; Core y Next local se ejecutan con Bun.

```bash
bun install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Completar .env con credenciales NUEVAS y la URL de PostgreSQL.
bun run migrate
bun run dev
```

La web abre en `http://localhost:3000`; Core escucha en `127.0.0.1:8080`. Usar el mismo hostname en navegador y variables. Registrar en Discord OAuth2 `http://localhost:3000/api/v1/auth/callback`. El callback pasa por el proxy web y la cookie queda en el origen de la web.

No arrancar Core con credenciales de producción para ejecutar pruebas. Las instrucciones completas están en [Instalación](docs/INSTALL.md).

## Comandos

| Comando | Función |
|---|---|
| `bun run dev` | Core y Next en paralelo |
| `bun run dev:core` / `bun run dev:web` | Una aplicación |
| `bun run start` | Core en Bun, desde los fuentes TypeScript |
| `bun run migrate` | Migraciones, solo requiere DATABASE_URL |
| `bun run test` | Suite en procesos Bun aislados; integración se omite sin DB de prueba |
| `bun run test:integration` | Exige NODE_ENV=test y studio_test; migra dos veces y ejecuta toda la suite |
| `bun run test:e2e` | Navegador → web → Core → PostgreSQL, Discord simulado |
| `bun run typecheck` | Apps, paquetes, scripts y pruebas |
| `bun run lint` / `bun run format:check` | Calidad y formato |
| `bun run build` | Bundle Core y build Next, con Bun |
| `bun run check` | Tipos, lint, suite y builds; E2E se ejecuta aparte |
| `bun scripts/benchmark.ts` | Benchmark sintético de liveness, sin servicios externos |

## Funcionalidades

- Reportes: filtros por departamento, proyecto, origen, autor, fecha y sincronización; creación idempotente, referencias Discord y exportación CSV de la página filtrada.
- Publicidad: registros de publicaciones y filtros de consulta existentes.
- Anuncios: borradores, edición con versión, versiones de contenido desde 0.4, constructor de embeds, plantillas aplicables, duplicación, vista aproximada, programación, cancelación e historial.
- Guías: lectura, búsqueda, categorías, edición versionada, restauración, archivo, enlace y publicación autorizada en foro.
- GitHub: fuentes, ramas, sincronización controlada, commits y lotes de desarrollo separados de releases, trazabilidad SHA y brechas de cobertura.
- Finanzas: registros, suscripciones, modificaciones con motivo, historial y resúmenes separados por moneda; exportación JSON de la página. Los importes conservan unidades menores enteras.
- Equipo: directorio parcial de asignaciones registradas, roles vivos, permisos efectivos y alta/retirada de asignaciones internas. No concede roles de Discord.
- Automatizaciones: acciones tipadas, reglas deshabilitadas por defecto, versiones, habilitación, ejecución idempotente y notificaciones.
- Auditoría: actividad, snapshots, comparación y descargas, fuentes del índice, importaciones, jobs e intentos y conciliación explícita.
- Preferencias locales: tema, acento, densidad, sidebar, columnas y avisos operativos.

Las pantallas consultan Core real. Los datos de prueba solo existen en `tests/e2e/core-fixture.ts`. Campos y estados ausentes se muestran como no disponibles. Los contadores almacenados no equivalen al historial completo de Discord.

## Documentación

[Arquitectura](docs/ARCHITECTURE.md) · [Instalación](docs/INSTALL.md) · [Bun](docs/BUN.md) · [Dashboard](docs/DASHBOARD.md) · [API y OAuth](docs/API_OAUTH.md) · [Permisos](docs/PERMISSIONS.md) · [GitHub](docs/GITHUB-INTEGRATION.md) · [Migraciones](docs/MIGRACIONES.md) · [Seguridad](docs/SEGURIDAD.md) · [Testing](docs/TESTING.md) · [FeatherPanel/VPS](docs/DEPLOY_FEATHERPANEL.md) · [Vercel](docs/DEPLOY_VERCEL.md) · [Rollback](docs/RECUPERACION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Matriz de migración](docs/REWORK_TRACEABILITY.md) · [Informe de revisión](docs/REWORK_REPORT.md).

Esta rama prepara una revisión. El arranque con Discord real, los dominios, el contenedor en FeatherPanel y la ejecución alojada en Vercel requieren validación operativa posterior. No se han usado credenciales reales ni se ha desplegado esta versión.
