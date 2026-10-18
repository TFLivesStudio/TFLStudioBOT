> Archivo histórico de 0.3. Para el monorepo actual consultar [README](../README.md) y [matriz del rework](REWORK_TRACEABILITY.md).

# Reportes, índice e importaciones — 0.3.0

## Fuentes

Reportes generados por slash, API, GitHub, mensajes/hilos manuales e historial autorizado comparten tabla reports y metadatos de origen, departamento, proyecto, autor, canal/foro/hilo, fecha, tags, sync_state y publication_status.

Fuentes iniciales: Network, Client, TFL Web, Web Brillara, Hosting, Publicidad, Propiedades y Merch. Por defecto enabled=false, capture_content=false y historical_enabled=false. Billing y Administración Global quedan fuera del índice común. Intent privilegiado MessageContent desactivado por defecto.

## Cambios en tiempo real

Se procesan messageCreate, messageUpdate, messageDelete, messageDeleteBulk, threadCreate, threadUpdate y threadDelete solo en destinos autorizados. El primer mensaje del hilo de foro representa el reporte, no cada respuesta. Un mensaje del propio bot se vincula por marca de correlación y autor comprobado, sin crear registro manual duplicado. Los eventos parciales no sobrescriben contenido conocido, y una edición vieja no debe reemplazar una versión de fecha posterior. Eliminaciones/threads inaccesibles preservan tombstones o estados missing/deleted.

Los attachments nunca se descargan masivamente. La indexación no inventa contenido faltante. Un estado unavailable no significa que el usuario borrase el mensaje.

## Histórico

- ADMIN configura fuentes mediante /api/v1/report-index/sources.
- Importaciones ADMIN: iniciar, pausar, cancelar, reanudar, consultar errores y progreso, recuperar huérfanos.
- Dry-run por defecto (sin insertar reportes definitivos, sin publicar Discord).
- Canales de texto usan cursor de mensaje descendente; foros recorren hilos activos y archivados públicos accesibles. Los errores no avanzan cursores incompletos.
- Cada lote almacena checkpoint y siguiente trabajo en la misma transacción. Leases evitan dos workers en el mismo lote. El reconciliador reprograma importaciones running sin lease vigente; las fuentes desactivadas producen estado paused.
- Problemas de timestamps archivados idénticos, hilos inaccesibles, nuevos hilos durante el recorrido o API parcial no garantizan cobertura total; la API marca cobertura parcial.

## Consulta y permisos

GET /api/v1/reports admite filtros de departamento, búsqueda, proyecto, fuente, autor, canal, intervalo, estado de sincronización y publicación, paginación y orden. La URL Discord se deriva solo de IDs conocidos. GET /api/v1/reports/{id} revisa permisos en el destino en cada solicitud. GET /api/v1/reports/export requiere ADMIN y protege contra fórmulas CSV.

GET /api/v1/report-index/coverage y GET /api/v1/stats muestran recuentos observados con fuente y calidad, no totales certificados del Discord histórico. Ningún ID adivinado permite acceso a otro departamento.
