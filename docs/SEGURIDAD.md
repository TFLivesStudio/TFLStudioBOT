# Seguridad 0.4

Las credenciales compartidas en conversaciones anteriores se consideran potencialmente comprometidas. Rotar BOT_TOKEN en Discord Developer Portal; actualizar el contenedor privado y revocar el valor anterior. Rotar DISCORD_CLIENT_SECRET, SESSION_SECRET, secretos de webhook y tokens GitHub que hayan sido expuestos. Rotar SESSION_SECRET invalida la derivación CSRF; eliminar las sesiones existentes durante una ventana autorizada fuerza nuevos logins. Nunca pegar nuevos valores en un issue, PR, documento o captura.

OAuth state aleatorio, cookies host-only HttpOnly, SameSite=Lax y Secure en producción. Sesiones persistidas por hash. CSRF HMAC y validación estricta de Origin tanto en BFF como en Core. CORS acotado, rate limit de 100 peticiones por minuto en Core, cuerpo máximo 1 MiB y límites de paginación. El proxy no es un mecanismo de autenticación alternativo.

Las páginas verifican sesión en servidor y las rutas vuelven a comprobarla en cada operación. No hay endpoints de asignación de privilegios globales ni aprobación de miembros. Los cambios visibles del navegador no sustituyen controles de backend.

El logger elimina cookies, Authorization, CSRF y Set-Cookie. Su serializador de URL omite querystrings para no registrar códigos OAuth. Los errores HTTP 5xx se presentan de forma genérica. Los secretos son variables privadas; web solo recibe CORE_INTERNAL_URL y WEB_ORIGIN del lado servidor. No usar NEXT_PUBLIC_ para ninguna de ellas ni pasar credenciales del bot a Vercel.

El contenido se presenta como texto React, sin HTML arbitrario ni ejecución de adjuntos. Discord utiliza allowedMentions vacío y neutraliza @ en mensajes. Los embeds solo admiten URLs HTTPS según esquema compartido. Los CSV neutralizan inicios de fórmulas. Los importes usan enteros seguros al escribir y cadenas exactas al sumar SQL.

Todas las pruebas externas son simulaciones explícitas; la integración usa studio_test. La fixture de navegador se inicia como proceso aparte en loopback y nunca se importa desde apps. No contiene puertas de acceso en producción.

Al alojar: HTTPS, PostgreSQL privado, privilegios mínimos del bot, rotación, backups y permisos de canal revisados. Mantener previews sin variables de Core de producción hasta que haya un entorno de revisión autorizado. La CSP permite inline necesario para Next; no se presenta como una CSP basada en nonces.
