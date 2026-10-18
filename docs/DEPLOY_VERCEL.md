# Dashboard en Vercel

Configuración preparada y contrastada con documentación oficial; no se ha creado un proyecto ni ejecutado un despliegue.

| Ajuste | Valor |
|---|---|
| Repositorio | TFLivesStudio/TFLStudioBOT |
| Root Directory | apps/web |
| Framework | Next.js |
| Incluir fuentes fuera de Root Directory | Habilitado, para packages/shared y bun.lock |
| Instalación | apps/web/vercel.json: cd ../.. && bun install --frozen-lockfile --filter @tfl/web |
| Build | bun run build, desde apps/web |
| Runtime Functions | bunVersion: 1.4.x |
| Output | Predeterminado de Next.js |

`rootDirectory` es un ajuste del proyecto, no una clave de vercel.json. Bun 1.4.x es el rango administrado admitido por Vercel; el parche de las Functions puede diferir del 1.4.3 verificado localmente.

Solo dos variables servidor para la web:

- CORE_INTERNAL_URL: dirección HTTPS del Core alcanzable desde Vercel, sin rutas de API. El nombre «internal» indica que la usa el servidor Next; no implica que una IP Docker privada sea alcanzable desde Vercel.
- WEB_ORIGIN: origen público exacto de este dashboard, sin slash final.

No configurar tokens Discord, secretos de sesión ni DATABASE_URL en la aplicación web. La web no accede directamente a PostgreSQL.

En Core: PUBLIC_API_URL=FRONTEND_URL=CORS_ORIGIN=WEB_ORIGIN, con HTTPS y COOKIE_SECURE=true. Registrar el callback `WEB_ORIGIN/api/v1/auth/callback` en Discord Developer Portal. El webhook de GitHub apunta al dominio HTTPS del Core directamente.

## Previews

Por defecto dejar CORE_INTERNAL_URL sin configurar en Preview: el proxy muestra indisponibilidad sin contactar producción. No copiar secretos ni destinos de producción automáticamente. Para una revisión conectada se necesita Core aislado y una URL de preview estable exacta en WEB_ORIGIN, CORS y callback; no se acepta comodín `*.vercel.app`. El inventario de guild permanece fijado: no se anuncia soporte automático de otro guild de staging. La alternativa reproducible sin servicios reales es el harness E2E con Discord simulado y studio_test.

No se añadieron hooks de deploy en CI. Si más adelante se conecta Git de Vercel, revisar su publicación automática y configurar el flujo de aprobación antes de habilitar producción. Un push de main no debe sustituir esa decisión operativa.

Validación alojada pendiente: OAuth real, cookies Secure, redirects, origen de previews, acceso desde Vercel a Core y comportamiento con el parche Bun asignado. El build local no demuestra por sí solo que esas conexiones externas funcionen.

Referencias: [Bun Functions](https://vercel.com/docs/functions/runtimes/bun), [Monorepos](https://vercel.com/docs/monorepos), [Configuración del proyecto](https://vercel.com/docs/project-configuration).
