# API, contratos y OAuth2

Contrato completo: `GET /api/v1/openapi.json` en Core o a través del origen web. shared proporciona validaciones de reportes/embeds/preferencias y contrato de sesión; los demás esquemas de escritura se validan en las rutas del Core y se describen en OpenAPI. Las pruebas cruzan todas las acciones del dashboard con rutas reales y verifican los esquemas referenciados de OpenAPI.

1. Navegador → `WEB_ORIGIN/api/v1/auth/login`.
2. Next reenvía a Core, que genera state criptográfico y cookie HttpOnly temporal.
3. Discord vuelve a `PUBLIC_API_URL/api/v1/auth/callback`; PUBLIC_API_URL es el origen web.
4. El proxy preserva las cookies y el redirect; Core verifica state, intercambia el código por identidad y comprueba membresía aprobada.
5. Core persiste el hash de sesión, devuelve cookie host-only HttpOnly y redirige a FRONTEND_URL.
6. `GET /auth/me` devuelve identidad, ámbito y HMAC CSRF, nunca el token OAuth o del bot.

Todas las mutaciones de navegador exigen Origin exactamente igual al permitido y X-CSRF-Token. Reportes y ejecuciones manuales de reglas exigen Idempotency-Key. El cliente conserva esa clave al reintentar el mismo formulario después de un error de transporte.

El proxy solo acepta rutas canónicas bajo `/api/v1`, excluye integrations, limita el cuerpo a 1 MiB, no sigue redirects del upstream y solo reenvía cookies de sesión/OAuth, Content-Type, CSRF e idempotencia. No reenvía Authorization arbitrario ni cookies ajenas. Usa destino fijo, timeout de 20 s y no-store. El servidor Next comprueba sesión con timeout de 12 s.

Webhooks: `https://CORE_PUBLIC_HOST/api/v1/integrations/github/webhook`, directamente en Core. HMAC se verifica sobre bytes originales. No pasa por el proxy del dashboard.

Códigos relevantes: 401 sesión caducada; 403 rol/origen/CSRF; 409 versión o transición incompatible; 429 límite de peticiones; 503 dependencia no verificable. Las respuestas privadas llevan no-store; el navegador vuelve al login al recibir 401.
