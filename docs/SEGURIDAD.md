# Seguridad TFL Studio Core — 0.3.0

## Modelo de confianza

Guild único 1264656310205415474; el rol ADMIN 1282541815802892289 es la única autoridad global. Studio NO es administrativo. Los roles de Minecraft, Hosting, Publicidad, Devs, etc. solo dan ámbito operativo. Discord conserva aprobación humana obligatoria y Core nunca autoaprueba solicitudes.

## Identidad y sesiones

OAuth2 identify, state aleatorio de corta duración, cookie HttpOnly SameSite=Lax y Secure en producción. El backend consulta membresía actual, pending y roles actuales en Discord REST para cada petición protegida. Hash del token de sesión en PostgreSQL; CSRF derivado mediante HMAC de SESSION_SECRET y sesión, estable en dos pestañas y revocado al cerrar sesión. Todas las mutaciones de navegador exigen Origin permitido y X-CSRF-Token válido. Los webhooks GitHub requieren HMAC-SHA256 sobre bytes originales.

## Autorización por recurso

Los foros usan ViewChannel+SendMessages para nuevas publicaciones y SendMessagesInThreads para respuestas. Las sobrescrituras @everyone, roles y miembros y Administrator se aplican en permissions.ts. Tanto slash como HTTP utilizan esta política. Las respuestas por ID (p. ej. reports/{id} y guides/{id}) comprueban departamento y permisos vivos; consultas de Billing, personal, auditor, automatizaciones, importaciones, GitHub y conciliaciones exigen ADMIN.

## Contenido y datos

Indexación opt-in por canal auditado. No recopilar todo el servidor ni Billing/Administración Global como índices comunes. MessageContent desactivado por defecto y requiere Developer Portal + autorización. Adjuntos no se descargan indiscriminadamente. No se generan menciones masivas desde texto externo: allowedMentions.parse vacío. Los datos financieros usan unidades menores enteras y no se mezclan monedas.

PostgreSQL consulta parametrizada, migraciones versionadas, control de versiones en guías/Billing/anuncios, solicitudes con body limit y rate limits HTTP. Secretos solo en mecanismos privados, no subir .env ni exports a GitHub. Los logs estructurados no deben incluir tokens, notas privadas o contenido de solicitudes.

## Límites de 0.3

No probada contra OAuth/Discord/GitHub reales ni revisados todos los overwrites de producción. Los worker threads y las comunicaciones con plataformas externas no garantizan exactamente-una-vez. Falta decidir política de retención/borrado y probar backups y rollback, revisar rate limits bajo carga y permisos mínimos del rol de bot antes de producción.

## Configuración de dominios

Ejemplos futuros (no confirmados): studio.tflives.com y api.studio.tflives.com, mismo sitio organizacional. Reverse proxy HTTPS con CORS_ORIGIN exacto, COOKIE_SECURE=true, trustProxy desactivado salvo configuración acotada, DB aislada.
