# Bun y compatibilidad

Core utiliza Bun **1.4.3**, fijado en `.bun-version`, packageManager, engines, CI y Dockerfile. Bun instala workspaces, genera bun.lock, ejecuta Core y la suite. Los scripts Next usan `bun --bun next`; el build usa webpack y una equivalencia explícita de imports `.js` a fuentes `.ts` compartidas.

Discord.js, Fastify y pg se conservaron. Las pruebas verifican Fastify real, fetch/AbortSignal, HMAC/crypto, cookies, sesiones, permisos, temporizadores, SQL, transacciones, outbox, recuperación y deduplicación bajo Bun. El Gateway no se conectó a Discord real: la validación de reconexión, límites reales y estabilidad prolongada queda pendiente del entorno autorizado.

La suite `node:test` conserva sus assertions y subtests. `scripts/test.ts` ejecuta cada archivo mediante `bun test` en un proceso separado: así los stubs globales fetch no se pisan entre archivos. La ejecución directa `bun archivo.test.ts` no es equivalente: las pruebas omitidas de node:test requieren el runner. No se añadieron mocks de PostgreSQL para sustituir la integración real.

El bundle del Core se produce en apps/core/dist/index.js. El arranque normal usa TypeScript fuente porque Bun no necesita compilación previa. Los paquetes privados permanecen externos al bundle y deben acompañarlo; dist no es un binario autónomo.

Next se compiló y ejecutó localmente con Bun. Playwright utiliza Node.js para su runner de navegador, tal como está configurado y probado; no forma parte del proceso del bot. Vercel admite bunVersion `1.4.x`, con parche gestionado por la plataforma, diferente del pin exacto local. No se declara validación de runtime alojado sin un despliegue de revisión.

Referencias consultadas: [Bun Workspaces](https://bun.sh/docs/pm/workspaces), [Bun + Next](https://bun.sh/guides/ecosystem/nextjs), [Runtime Bun en Vercel](https://vercel.com/docs/functions/runtimes/bun). Context7 se utilizó para contrastar los comandos con sus fuentes oficiales.
