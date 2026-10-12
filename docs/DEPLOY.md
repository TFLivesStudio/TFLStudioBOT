# 01 / DESPLIEGUE EN FEATHERPANEL (SIN EJECUTAR)

**No se ha autorizado un despliegue de producción.** Las acciones siguientes son instrucciones para cuando se apruebe.

1. Crear PostgreSQL y usuario con permisos mínimos; respaldos probados.
2. Rotar token del Auditor y crear credenciales nuevas de bot / OAuth. Registrar redirect URI exacta.
3. Configurar `.env` en FeatherPanel, jamás dentro de Git. HTTPS detrás de reverse proxy con `HOST=127.0.0.1` cuando proxy y API comparten host.
4. Instalar Node.js LTS mantenida compatible. `npm install` y generar lockfile verificando dependencias.
5. Ejecutar `npm run migrate`, `npm run build`, `npm test` en entorno controlado.
6. Ejecutar `node dist/index.js`. Comprobar salud y gateway. El registro automático de comandos se ejecuta en arranque.
7. Autorizar un webhook firmado GitHub en API HTTPS y habilitar fuentes por API ADMIN, **solo tras probar destino y etiquetas**.
8. Revisar consola y tabla `automation_jobs` ante `needs_reconciliation` antes de reintentar.
9. En rollback detener proceso, restaurar versión anterior y datos según migración; nunca revertir esquema sin evaluación.

Seguridad: restringir acceso de red y CORS, no habilitar API a través de HTTP público, monitorizar 401/403/429, realizar prueba con cuenta no administrativa y con roles de cada departamento.

Varias áreas usan canales de texto para reportes y otras foros. El bot no crea ni modifica categorías, canales o permisos.
