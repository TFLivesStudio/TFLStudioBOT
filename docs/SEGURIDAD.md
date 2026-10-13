# CONTRATO DE SEGURIDAD

- Solo TFL Studio Guild 1264656310205415474.
- ADMIN 1282541815802892289 decide operaciones globales; Studio nunca equivale a ADMIN.
- La aprobación humana nativa permanece intacta.
- Autenticación por Discord OAuth2 con state aleatorio, verificación de identidad y membresía actual.
- Cookies de sesión HttpOnly, Secure en producción, SameSite=Lax, almacenadas solo como hash en PostgreSQL.
- CSRF HMAC estable por sesión con SESSION_SECRET privado y encabezado X-CSRF-Token para cambios; consultas de /auth/me no rotan tokens en varias pestañas.
- Frontend sugerido: studio.tflives.com. API sugerida: api.studio.tflives.com. Son ejemplos, no dominios activos.
- Las cookies mismo sitio no dependen de cookies de terceros. HTTPS y Origin exacto obligatorios.
- Permisos de foros GuildForum/GuildMedia: ViewChannel y SendMessages. Respuestas en hilos: SendMessagesInThreads. Roles y sobrescrituras individuales se validan en Discord.
- Billing, personal, auditoría, integraciones y conciliación son rutas ADMIN.
- MessageContent está desactivado por defecto. Los índices no importan todo el servidor.
- Los webhooks GitHub deben verificar HMAC sobre bytes originales. Se prohíben menciones masivas por defecto.
- No se publican secretos, datos privados ni tokens en este repositorio público.

Pendientes antes de producción: rotación del token del Auditor, retención de datos, políticas de acceso y backup, pruebas controladas de Discord, hardening del reverse proxy y limitación de permisos del propio bot.
