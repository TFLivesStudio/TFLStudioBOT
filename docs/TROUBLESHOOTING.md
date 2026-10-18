# Problemas frecuentes

| Síntoma | Comprobación / corrección |
|---|---|
| `bun: command not found` | Instalar 1.4.3 y revisar PATH del usuario/contenedor |
| «Database migrations incomplete» | Ejecutar el runner contra la misma DATABASE_URL del Core |
| Migrar pide token Discord | No usar el runner 0.3 antiguo: 0.4 solo necesita DATABASE_URL |
| OAuth state inválido | Login y callback deben pasar por el mismo origen web; comprobar PUBLIC_API_URL y cookies |
| API 403 al guardar | Revisar Origin exacto, CSRF, permisos vivos y aprobación del miembro |
| API 409 | Recargar versión/estado; no sobrescribir conflictos a ciegas |
| 503 en Vercel | CORE_INTERNAL_URL debe ser alcanzable desde Vercel; localhost no es tu VPS |
| Preview no guarda | Comprobar origen y callback específicos; producción no admite comodines |
| Comandos ausentes | Revisar startup del Core, application ID, guild autorizado y registro REST; las pruebas no registran comandos |
| Worker «No disponible» | Revisar heartbeat jobs reciente y conexión Gateway; sweep tiene otro intervalo |
| Reporte queued | Intención persistida; comprobar worker y job. No crear otro reporte para «reintentar» |
| Resultado needs_reconciliation | Verificar mensaje remoto y referencia antes de vincular o reintentar |
| Guía no publica | Límite de cuerpo, estado activo, versión, vínculo previo y foro autorizado |
| Fuente GitHub sin historial | Primera activación establece cursor, no inventa backfill; revisar coverage_gap |
| Intent de contenido rechazado | Activar explícitamente en Portal y configuración, solo con autorización |
| Directorio incompleto | Su ámbito son asignaciones registradas; no es un censo del guild |
| Sin integración en `bun run test` | Ejecutar test:integration con NODE_ENV=test y studio_test |
| Build web no resuelve shared | Instalar workspaces desde raíz y habilitar fuentes fuera de Root Directory |

Los errores 5xx ocultan detalles al navegador. Revisar logs seguros del Core y IDs de jobs, sin adjuntar tokens ni cookies a tickets.
