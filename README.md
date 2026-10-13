# TFL STUDIO CORE — 0.3.0

Backend administrativo exclusivo del Discord privado TFL Studio: Node.js LTS, TypeScript estricto, discord.js, Fastify, PostgreSQL. API-first y sin frontend integrado: el dashboard se desarrollará independientemente en Vercel.

**Estado:** 0.3.0 en desarrollo, CI con pruebas PostgreSQL y simulaciones externas. No desplegado, no validado con Discord real y V1 no certificada.

## Garantías fundamentales

- Guild 1264656310205415474; autoridad ADMIN 1282541815802892289. Studio y roles departamentales NO dan administración global.
- Aprobación de ingreso humana mediante Discord; el bot no acepta integrantes.
- Categorías, canales, foros, tags, roles y permisos existentes permanecen inalterados.
- Billing, datos de personal, auditoría privada, integraciones y conciliación únicamente para ADMIN.
- Fuentes de GitHub, indexación y automatizaciones desactivadas por defecto.
- Nunca publicar credenciales, datos financieros privados, exports internos ni tokens en este repositorio público.

## Funciones de 0.3

| Módulo | Implementación |
|---|---|
| Permisos | Membresía vigente, aprobación, roles actuales, permisos efectivos de canales, sobreescrituras |
| Reportes | Slash/API, outbox, captura manual opcional, importador recuperable, metadatos, filtros y export privado |
| GitHub | Commits asignados transaccionalmente a resúmenes, reported_at solo con publicación confirmada, releases/changelog independientes, tags y rangos SHA verificables |
| Anuncios | Borradores editables y duplicables, embeds, plantillas, programación, reprogramación, cancelación, publicación en cola y conciliación |
| Guías | Catálogo, versiones, conflictos, restauración, archivado, enlace/publicación con foro y estado de sincronización |
| Billing | CRUD controlado, historial before/after, suscripciones, renovaciones, unidades menores exactas y totales por moneda |
| Automatizaciones | Definiciones tipadas, activación opt-in, ejecución manual/intervalos y notificaciones internas |
| Observabilidad | Diagnóstico ADMIN, estado de worker, cobertura de índices, jobs y fuentes |
| Auditor | Captura estructural JSON/Markdown, snapshots, comparación y estados de completitud |

### Inicio aislado

Node.js 22.12+ (CI: Node 22), PostgreSQL 16 de pruebas. Crear configuración privada desde .env.example y **no usar credenciales del Guild real sin permiso**.

~~~bash
npm ci
npm run migrate
npm run typecheck
npm test
npm run build
npm start
~~~

FeatherPanel Main File: dist/index.js. Comando: node dist/index.js. **Importante:** el arranque registra comandos slash y conecta Gateway, por lo que no debe ejecutarse contra el Discord privado sin autorización.

API: GET /api/v1/health/live, GET /api/v1/health/ready, GET /api/v1/openapi.json. OAuth2, cookie HttpOnly y encabezado X-CSRF-Token para mutaciones.

## Documentación

- docs/ARCHITECTURE.md — componentes y límites.
- docs/INDEXACION.md — fuentes y alcance histórico.
- docs/RECUPERACION.md — jobs ambiguos y recuperación.
- docs/GITHUB-INTEGRATION.md — commits/releases y cobertura.
- docs/SEGURIDAD.md — controles y roles.
- docs/DEPLOY.md — preparación detallada para FeatherPanel.
- docs/MIGRACIONES.md — 13 migraciones.
- docs/IMPLEMENTATION.md — estado verificado y limitaciones.
- docs/CIERRE-MISION-0.3.0.md — matriz técnica de cierre.

**Ninguna prueba de CI publica mensajes ni cambia la base de datos de producción.**
