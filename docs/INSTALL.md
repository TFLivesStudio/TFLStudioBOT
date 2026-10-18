# Instalación y desarrollo

1. Instalar Bun **1.4.3**; comprobar `bun --version`. Clonar la rama deseada y ejecutar `bun install --frozen-lockfile` en la raíz.
2. Crear `.env` desde `.env.example`. Configurar PostgreSQL propio, un SESSION_SECRET nuevo y las credenciales nuevas de la aplicación Discord. No reutilizar tokens compartidos anteriormente.
3. Crear `apps/web/.env.local` desde su ejemplo. Para desarrollo local usar localhost de forma consistente: WEB_ORIGIN, CORS_ORIGIN, FRONTEND_URL y PUBLIC_API_URL son `http://localhost:3000`. CORE_INTERNAL_URL puede ser `http://127.0.0.1:8080` porque es tráfico entre procesos del mismo host.
4. Añadir el callback `http://localhost:3000/api/v1/auth/callback` a Discord Developer Portal. `identify` basta para OAuth: la membresía la verifica el bot desde Core.
5. Ejecutar `bun run migrate` con DATABASE_URL apuntando a la base prevista. No abre Gateway ni necesita token del bot.
6. `bun run dev` inicia ambos procesos. `bun run dev:core` y `bun run dev:web` permiten trabajar por separado. Core carga explícitamente el `.env` de la raíz; Next carga `.env.local` de apps/web.

El inicio real de Core verifica la última migración, inicia Gateway, registra los cuatro comandos en el guild auditado y arranca API/worker. Registrar comandos es una operación externa: no se ejecuta en la suite de pruebas.

Para iniciar una base desechable exclusivamente de pruebas:

```bash
docker compose -f compose.test.yml up -d --wait
NODE_ENV=test TEST_DATABASE_URL=postgres://studio:studio_local_test_only@127.0.0.1:5433/studio_test bun run test:integration
bun run build
NODE_ENV=test TEST_DATABASE_URL=postgres://studio:studio_local_test_only@127.0.0.1:5433/studio_test bun run test:e2e
docker compose -f compose.test.yml down
```

La base del compose es tmpfs: al detenerla se pierde solo esa base de pruebas. En PowerShell definir las variables con `$env:NODE_ENV="test"` y `$env:TEST_DATABASE_URL="..."` antes de ejecutar Bun. Estas contraseñas de ejemplo pertenecen únicamente al servicio local de pruebas.
