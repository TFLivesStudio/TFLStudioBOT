# TFL Studio Core

**Backend administrativo privado de TFL Studio** · Discord Bot + API REST v1 + PostgreSQL + jobs · **Sin dashboard integrado**.

> Estado: implementación inicial en desarrollo. No desplegado ni verificado contra Discord/GitHub de producción. No significa que la V1 completa esté terminada.

## Principios invariables

- Solo opera en Guild ID `1264656310205415474`; `ADMIN` es la única autoridad administrativa global.
- No sustituye, acelera ni automatiza la aprobación humana de miembros.
- No reestructura categorías/canales/roles. Respeta IDs de la auditoría del 12/10/2026.
- Los roles departamentales solo habilitan funciones específicas; `Studio` no equivale a administración.
- Billing, asignaciones de personal, auditoría y fuentes GitHub solo para ADMIN.
- No incluye dashboard: el frontend posterior consumirá la API con Discord OAuth2.

## Stack

Node.js LTS (22.12+), TypeScript estricto, discord.js 14, Fastify 5, PostgreSQL (pg), Zod. Migraciones SQL explícitas. Servicio único para API, Gateway y tareas; mantener una sola réplica de workers hasta implementar coordinación distribuida.

## Inicio (local / entorno de pruebas)

1. Crear una aplicación Discord **de pruebas**, con su token y OAuth2 callback `http://localhost:8080/api/v1/auth/callback`. El Guild configurado está restringido al Studio real; **no ejecutar comandos/escrituras en producción sin autorización**.
2. `cp .env.example .env` y configurar credenciales **nuevas** (el token del Auditor anterior se considera comprometido).
3. Crear base de datos PostgreSQL, luego `npm ci` (dependencias fijadas en `package-lock.json`).
4. `npm run migrate`, `npm run build`, `npm test`, `npm start`.
5. API: `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1/openapi.json`.

## API, OAuth y frontend futuro

Inicio sesión: `GET /api/v1/auth/login`. Discord redirige a `/api/v1/auth/callback` y el backend establece cookie de sesión HttpOnly con token aleatorio almacenado como hash. El frontend utiliza `credentials: "include"` y consulta `GET /api/v1/auth/me` para obtener perfil, ámbito y token CSRF temporal. En cada operación de escritura enviar `X-CSRF-Token` y `Origin` exacto, además de `Idempotency-Key` para publicar reportes. El backend comprueba la membresía real y los roles mediante la API REST de Discord **en cada petición**; el frontend nunca recibe el token del bot ni el de Discord OAuth.

En producción se requieren HTTPS, `COOKIE_SECURE=true` y configuración exacta `CORS_ORIGIN`. Las cookies cross-site requieren políticas de navegador compatibles; se recomienda usar un proxy bajo el mismo sitio organizacional para evitar bloqueos de cookies de terceros.

## Endpoints implementados (primera entrega)

- Discord OAuth, sesiones y CSRF
- Reportes manuales (foro/texto), consultas filtradas por departamento
- Publicaciones de marketing, guías internas, asignaciones registrales (no roles Discord)
- Borradores/programación de anuncios (canal de anuncios permitido)
- Billing privado para ADMIN (registros mínimos, sin pagos)
- Estado de jobs, auditoría de acciones, estadísticas de registros
- Configuración de repositorio TFL Client, webhook GitHub firmado, procesador de releases y commits agrupados

Los reportes históricos de Discord **no se importan automáticamente**. Su indexación futura requiere alcance y permisos aprobados.

## GitHub

El origen `TFLivesStudio/TFLClient` se inicializa **desactivado**. Configurar `GITHUB_WEBHOOK_SECRET` y webhook en `POST /api/v1/integrations/github/webhook`; activar con endpoint ADMIN. Commits de `main` se agrupan según `batch_minutes`; releases se encolan individualmente para publicación anticipada. El polling alternativo permite recuperar releases y commits nuevos desde la rama configurada; al habilitarlo por primera vez establece un cursor sin publicar todo el historial. `GITHUB_TOKEN` es recomendable por el límite de la API anónima. Comparaciones de más de 100 commits requieren paginación adicional y se detienen sin avanzar el cursor. Se registra un ID de entrega y claves únicas en PostgreSQL.

**Etiquetas de foro:** los reportes manuales de Network usan UPDATE por defecto y TFL Web utiliza Desarrollo. La categorización exacta debe revisarse antes de activar el flujo.

**Precaución sobre duplicados:** publicar en Discord y confirmar una transacción SQL no forman una transacción distribuida. Ante un fallo ambiguo el sistema requerirá reconciliación operativa antes de reintentar; no prometer exactamente una publicación bajo todos los fallos. La separación semántica entre changelog de release y commits se mantiene, pero la desduplicación semántica completa entre ambos exige una política posterior.

## Seguridad y límites

- Mantener secretos solo en variables de entorno; no versionar tokens, dumps ni información de personal.
- Sesiones Hash SHA-256, CSRF por sesión, verificación webhook HMAC-SHA256, CORS exacto, rate limit, consultas parametrizadas, comprobación de ámbito por área y permisos ADMIN.
- `/recopilar` exporta un nuevo inventario estructural parcial JSON/Markdown. No se ha migrado el código original del Auditor ni equivale a su exportación completa.
- Este árbol no es una restauración del bot Auditor antiguo. Es una aplicación nueva que preserva el destino y el modelo funcional del servidor.
- Ningún componente publica ni despliega por el simple hecho de estar escrito en GitHub. La escritura ocurrirá **solo cuando se arranque el proceso con credenciales reales**.

Consulta [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) y [docs/DEPLOY.md](docs/DEPLOY.md).

## Estado de verificación

GitHub Actions ha ejecutado correctamente instalación de dependencias, comprobación TypeScript, pruebas unitarias actuales y compilación. **No** se han ejecutado pruebas reales sobre el Discord privado ni migraciones sobre PostgreSQL de producción. El código se ha desarrollado directamente con el conector autenticado de GitHub.
