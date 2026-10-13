# 01 / DESPLIEGUE EN FEATHERPANEL (SIN EJECUTAR)

**No se ha autorizado un despliegue de producción.** Las acciones siguientes son instrucciones para cuando se apruebe.

1. Crear PostgreSQL y usuario con permisos mínimos; respaldos probados.
2. Rotar token del Auditor y crear credenciales nuevas de bot / OAuth. Registrar redirect URI exacta.
3. Configurar `.env` en FeatherPanel, jamás dentro de Git. HTTPS detrás de reverse proxy con `HOST=127.0.0.1` cuando proxy y API comparten host.
4. Instalar Node.js LTS mantenida compatible. `npm ci` usando `package-lock.json` versionado.
5. Ejecutar `npm run migrate`, `npm run build`, `npm test` en entorno controlado.
6. Ejecutar `node dist/index.js`. Comprobar salud y gateway. El registro automático de comandos se ejecuta en arranque.
7. Autorizar un webhook firmado GitHub en API HTTPS y habilitar fuentes por API ADMIN, **solo tras probar destino y etiquetas**.
8. Revisar consola y tabla `automation_jobs` ante `needs_reconciliation` antes de reintentar.
9. En rollback detener proceso, restaurar versión anterior y datos según migración; nunca revertir esquema sin evaluación.

Seguridad: restringir acceso de red y CORS, no habilitar API a través de HTTP público, monitorizar 401/403/429, realizar prueba con cuenta no administrativa y con roles de cada departamento.

Varias áreas usan canales de texto para reportes y otras foros. El bot no crea ni modifica categorías, canales o permisos.


## Requisitos adicionales 0.2.0

- Crear SESSION_SECRET aleatorio de al menos 32 caracteres y conservarlo exclusivamente en el gestor de secretos. Cambiarlo invalida los CSRF existentes; coordinar rotaciones.
- INDEX_MESSAGE_CONTENT_INTENT=false inicialmente; cualquier cambio requiere configuración explícita del Discord Developer Portal y autorización de captura.
- Mantener desactivados report_index_sources, los webhooks y github_sources hasta pruebas controladas y permiso explícito.
- El servicio debe aplicar siete migraciones versionadas, comprobar el esquema y disponer de restauración probada de PostgreSQL.
- La API y el dashboard pueden usar dominios del mismo sitio organizacional con cookies SameSite=Lax. Configurar CORS_ORIGIN exacto y HTTPS.
- No desplegar a producción por disponer de CI verde: falta validación de roles, destinos y contingencias con instancias de prueba.
