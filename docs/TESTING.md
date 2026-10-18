# Verificación reproducible

## Sin servicios externos

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build
```

La suite sin DATABASE_URL de prueba omite expresamente los grupos PostgreSQL; no equivale a la verificación completa.

## PostgreSQL aislado

Usar PostgreSQL 16 y una base **studio_test**. El compose de la raíz es desechable. Establecer NODE_ENV=test y TEST_DATABASE_URL. `bun run test:integration` verifica el nombre de la base, ejecuta migraciones dos veces y ejecuta todos los archivos de pruebas en procesos Bun separados.

Se conservan las pruebas de 0.3: permisos por canal, HMAC, sesiones en varias pestañas, revocación, imports recuperables, eventos duplicados, outbox, concurrencia de claims, fallos después de publicación, relaciones commit/reporte, tags anotados/movidos y ciclos administrativos. Se añaden contratos dashboard→rutas, seguridad del BFF, forms, worker drain, autorización al publicar y conservación byte a byte de SQL y datos durante upgrade.

## Navegador

```bash
bunx playwright install --with-deps chromium
bun run build
NODE_ENV=test TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/studio_test bun run test:e2e
```

Playwright inicia dos procesos temporales: Next en 19080 y Core en 19081. Core usa Fastify, autenticación, sesiones y PostgreSQL reales. Solo Discord REST y la autorización externa se simulan; el state lo genera el Core real y el callback lo valida. No se inicia Gateway, no se registra slash commands ni se lanza worker contra Discord.

La fixture guarda registros de prueba con prefijo e2e-fixture y cada operación de prueba crea datos en studio_test. La base debe ser desechable: no se conecta a producción. Los endpoints `__test` existen únicamente en ese proceso independiente, en loopback; el BFF de producción no permite accederlos.

Flujos: OAuth/cookies/logout y ruta protegida; creación/edición/revisiones/archivo de guía; embeds de anuncio y programación/cancelación; finanzas enteras y acceso departamental; reporte y filtros, preferencias persistentes y móvil; revocación ADMIN, CSRF, Origin y rutas de proxy.

Resultados de ejecución y límites: [REWORK_REPORT.md](REWORK_REPORT.md). En este entorno se utilizó un Chromium empaquetado alternativo por restricciones de descarga; PLAYWRIGHT_CHROMIUM_EXECUTABLE permite fijar su ruta sin añadir esa dependencia a producción.

## CI

GitHub Actions ejecuta instalación congelada, formato, tipos, lint, integración con PostgreSQL 16, ambos builds y Playwright. No incluye secretos operativos ni pasos de despliegue. Los artefactos de fallo contienen exclusivamente sesiones simuladas y datos de prueba.

## Verificación operativa posterior

Tras autorización de una instancia real: verificar OAuth, permisos efectivos del bot, cuatro comandos, conexión/reconexión Gateway, rate limits reales y cierre controlado. Comprobar un flujo autorizado de publicación y su conciliación. Estas acciones no se sustituyen por pruebas sintéticas ni se ejecutan en esta rama por defecto.
