# FeatherPanel / VPS

Configuración preparada, sin despliegue ejecutado ni imagen Docker construida en esta sesión.

## Contenedor

Construir desde la raíz del monorepo:

```bash
docker build --target core -t tfl-studio-core:0.4.0 .
```

Dockerfile utiliza oven/bun:1.4.3, instalación congelada y filtrada al workspace Core y usuario bun. El dashboard no se ejecuta en este contenedor. Incluye los fuentes de paquetes internos y SQL; los imports workspace no se pueden separar del bundle sin empaquetarlos.

En FeatherPanel usar esta imagen personalizada o una imagen propia equivalente con Bun 1.4.3 y el repositorio completo. Startup del repositorio (directorio raíz):

```bash
bun apps/core/src/index.ts
```

Instalación/actualización en un volumen con checkout completo:

```bash
bun install --frozen-lockfile --production --filter @tfl/core
bun run migrate
```

Ejecutar migración una vez en ventana autorizada y con backup; no se ejecuta automáticamente en cada arranque. En una imagen inmutable se instala al construir y se usa un proceso puntual con la misma imagen para migrar.

## Variables

Inyectar las de .env.example mediante configuración privada. NODE_ENV=production, HOST=0.0.0.0 dentro del contenedor, PORT al puerto interno asignado, COOKIE_SECURE=true. PUBLIC_API_URL, FRONTEND_URL y CORS_ORIGIN usan el origen HTTPS exacto de la web, sin slash final. DATABASE_URL apunta al servicio PostgreSQL accesible desde esa red; nunca asumir que localhost es la VPS.

El reverse proxy HTTPS público del Core debe alcanzar el puerto interno. No abrirlo indiscriminadamente a internet. Vercel debe poder alcanzar CORE_INTERNAL_URL mediante HTTPS; un destino 127.0.0.1 o una red Docker privada no es accesible desde Vercel. Configurar el acceso de red correspondiente antes de conectar la web.

Health: `/api/v1/health/live` confirma API; `/api/v1/health/ready` requiere DB y Gateway. Diagnóstico detallado exige ADMIN. No interpretar liveness como disponibilidad completa.

## Actualización

1. Backup PostgreSQL y configuración privada; guardar commit e imagen de retorno.
2. Parar la instancia anterior para evitar dos Gateways/workers concurrentes durante el cambio.
3. Instalar o reemplazar imagen, aplicar migraciones en la base correcta y arrancar Core.
4. Verificar ready, heartbeat reciente, pool y permisos desde el dashboard.
5. Comprobar un flujo autorizado y el registro de jobs. No probar publicando de forma automática en Discord.

El proceso espera tareas activas al recibir SIGTERM/SIGINT. Dar margen al cierre; cada llamada externa tiene timeout, pero una sincronización paginada puede necesitar más que el timeout de una sola petición. Una terminación forzada puede dejar resultados inciertos que requieren conciliación; no forzar su reenvío.

Los datos críticos residen en PostgreSQL; exports y backups deben almacenarse fuera del contenedor. Ver [Rollback](RECUPERACION.md).
