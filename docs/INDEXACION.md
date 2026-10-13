# INDEXACIÓN / REPORTES MANUALES

El sistema admite publicaciones del bot, mensajes manuales y reportes GitHub. Se conservan identificadores originales de Discord, fuente, departamento, fecha, contenido cuando está autorizado, estado de sincronización y marcas de eliminación.

## Fuentes

Fuentes auditadas: Network, TFL Client, TFL Web, Web Brillara, Hosting, Publicidad, Propiedades y Merch. Todas inician desactivadas; capture_content e historical_enabled también están desactivadas. Billing y Administración Global se excluyen del índice general.

Eventos: messageCreate, messageUpdate, messageDelete, threadCreate y threadUpdate. El starter de un foro representa su reporte, y las respuestas no generan reportes separados. Los mensajes propios se correlacionan con su ID interno para evitar registros duplicados.

## Historial

La API ADMIN ofrece fuentes, progreso, inicio, cancelación y reanudación. El modo dry-run predeterminado registra contadores pero no escribe reportes. Los canales de texto se paginan por message ID; los foros recorren hilos activos y archivados públicos accesibles. Los checkpoints permiten reinicios y las claves únicas reducen duplicados.

Los fallos de permisos, el contenido no disponible y los archivos privados no se reemplazan por valores inventados. El resultado debe presentarse como parcial si no se pudo recorrer todo el alcance. La cancelación es cooperativa entre lotes. Las marcas de tiempo iguales en páginas archivadas pueden necesitar una verificación posterior. No se descargan archivos adjuntos indiscriminadamente.
