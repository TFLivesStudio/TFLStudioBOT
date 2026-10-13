# TFL Studio Core 0.3.0 — PREPARACIÓN PARA FEATHERPANEL

**No desplegado.** Este documento prepara la próxima prueba operativa controlada; ejecutar el bot con credenciales reales modifica el registro de slash commands. Requiere autorización adicional.

## Runtime y main file

- Runtime verificado en CI: **Node.js 22 LTS**, npm y PostgreSQL 16. Requisito package.json: Node >=22.12.
- Directorio habitual en FeatherPanel: /home/container (verificar el path configurado).
- Main File: **dist/index.js**.
- Comando de inicio: **node dist/index.js** (npm start es equivalente).
- Dependencias: npm ci; usa package-lock.json fijado.
- Compilación de staging: npm run typecheck y npm run build.
- Migración explícita de staging: npm run migrate. Trece migraciones. Nunca apuntar DATABASE_URL a producción sin backup y permiso.
- Monolito único con API, Discord Gateway y worker. Evitar replicación de workers sin coordinación adicional.

## Variables privadas

Todas las claves vienen de .env.example. Mantener fuera de Git, logs, mensajes y artefactos públicos.

| Variable | Explicación |
|---|---|
| NODE_ENV | production exige HTTPS y cookies seguras; test/development para ensayos |
| HOST | 127.0.0.1 con proxy mismo namespace; 0.0.0.0 solamente si el contenedor usa red privada protegida |
| PORT | Puerto HTTP del backend |
| PUBLIC_API_URL | URL HTTPS pública de la API, origen del OAuth callback |
| FRONTEND_URL | URL del dashboard independiente |
| CORS_ORIGIN | Origen exacto de la web; no usar * |
| COOKIE_SECURE | true obligatorio en producción |
| BOT_TOKEN | Token nuevo de bot, privado; rotar el Auditor anterior |
| DISCORD_CLIENT_ID | 1559294093962510386 |
| DISCORD_CLIENT_SECRET | Secreto OAuth2; nunca público |
| DISCORD_GUILD_ID | 1264656310205415474 |
| ADMIN_ROLE_ID | 1282541815802892289 |
| DATABASE_URL | Conexión PostgreSQL de mínima exposición |
| SESSION_SECRET | Aleatorio con alta entropía, longitud >=32; rotación coordinada |
| INDEX_MESSAGE_CONTENT_INTENT | false por defecto; activar solo tras autorización y Developer Portal |
| GITHUB_WEBHOOK_SECRET | HMAC independiente para GitHub, opcional |
| GITHUB_TOKEN | GitHub API de mínimo alcance, opcional |
| GITHUB_POLL_ENABLED | false por defecto |
| LOG_LEVEL | info de forma ordinaria; proteger logs |

Ejemplo de distribución DNS organizacional, NO confirmada: https://studio.tflives.com para dashboard y https://api.studio.tflives.com para API. Son subdominios del mismo sitio; permiten SameSite=Lax sin depender de third-party cookies.

## Configuración Discord y OAuth2

- Gateway requiere intents Guilds y GuildMessages. MessageContent es privilegiado, opt-in y desactivado al instalar.
- Permisos mínimos del bot por canal: ViewChannel, SendMessages para texto y creación de posts de foros, SendMessagesInThreads para respuestas, EmbedLinks para anuncios visuales, lectura de historial e hilos autorizados según el módulo.
- Los foros con tags obligatorios exigen tags preexistentes válidos. No crear tags, canales, categorías, roles o overwrites automáticamente.
- La aplicación históricamente dispone del rol Bot Oficial con Administrator; revisar mínimo privilegio como paso aparte, sin alterarlo desde este código.
- Scope OAuth: identify. Redirect URI exacto: PUBLIC_API_URL + /api/v1/auth/callback.
- Discord conserva la aprobación humana. ADMIN es el único administrador global; Studio no lo es.
- **En el arranque se invoca registerCommands y se conecta el Gateway**. Nunca iniciar con el Guild real sin autorización expresa.

## API, TLS y PostgreSQL

- Configurar reverse proxy Nginx/FeatherPanel TLS HTTPS; proteger backend y DB a nivel de red. No exponer PostgreSQL.
- Cookies HttpOnly, Secure en production, SameSite=Lax. API requiere Origin exacto y X-CSRF-Token para mutaciones, credenciales incluidas para frontend.
- El backend mantiene trustProxy desactivado por defecto: no habilitar proxies indiscriminados sin revisar IPs.
- Base de datos independiente de pruebas; se recomienda separar credenciales de migración y uso diario.
- Backup comprobado antes de migraciones; prueba de restauración y procedimiento de recuperación en caso de fallo.

## Plan de ensayos incrementales — siempre previa autorización

1. Arranque y conectividad con entorno controlado, logs y /api/v1/health/live y /ready.
2. Comandos de solo lectura (/estado-bot, /recopilar) tras comprobar permisos.
3. OAuth2, CSRF multitaba, logout y API con cuenta sin ADMIN y ADMIN.
4. Canales/foros, roles, permisos efectivos y su revocación.
5. Fuente única autorizada de indexación y dry-run, revisar cursor/cobertura.
6. Publicación explícita en destino de ensayo autorizado, comprobar outbox y reconciliación.
7. Webhook GitHub firmado, commits agrupados y release de repositorio de pruebas; fuentes inactivas hasta ese momento.
8. Revisión completa de auditoría, datos, seguridad y rollback antes de considerar producción.

## Salud, logs y monitorización

GET /api/v1/health/live verifica servicio HTTP. GET /api/v1/health/ready comprueba PostgreSQL y gateway. GET /api/v1/diagnostics (ADMIN) expone conexiones, jobs, corazón del worker y errores recientes. GET /api/v1/jobs/metrics, /api/v1/report-index/coverage e importaciones describen su alcance parcial.

Logs esperados: arranque del Core, estados del worker, fallos limitados de consultas externas e importaciones. No incluir credenciales ni contenido financiero privado en logs. El estado needs_reconciliation NO debe reintentarse a ciegas.

## Desactivar integraciones, parar y revertir

- Desactivar las fuentes GitHub por PATCH /api/v1/github/sources/{id}, las fuentes de captura por PATCH /api/v1/report-index/sources/{id}, y las automatizaciones con POST /api/v1/automations/{id}/enable con enabled=false y versión esperada.
- Revisar trabajos queued/running/needs_reconciliation. La desactivación no garantiza detener una llamada remota iniciada.
- Cancelar trabajos aún pendientes mediante /api/v1/jobs/{id}/cancel, pero no asumir que un mensaje ambiguo no se publicó.
- Detener el servicio antes del rollback. Mantener backups tanto de datos como del código y configuración; migraciones nuevas no se revierten con un downgrade del proceso. Restaurar una copia ensayada, nunca borrar migraciones a mano.
- No ejecutar estas pruebas con el Discord privado real ni apuntar a BD productiva hasta obtener autorización específica.
