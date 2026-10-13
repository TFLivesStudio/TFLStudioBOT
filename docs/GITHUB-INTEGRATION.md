# TFL CLIENT / GITHUB

## Flujos independientes

DESARROLLO: sincronización de la rama configurada, consulta de SHAs con comparaciones paginadas, registro de commits, agrupación por ventana y publicación con enlaces/autores.

RELEASE: versión, título, fecha, tipo release/prerelease, URL y changelog oficial. Se procesa de forma independiente, sin esperar los lotes de desarrollo.

## Requisitos de integridad

GitHub webhook exige firma HMAC-SHA256 del cuerpo original. Repositorios y ramas deben figurar en configuración; los delivery IDs se deduplican. No se confía en arrays truncables de commits recibidos por webhook. Los cambios se recuperan desde GitHub Compare, avanzando cursor solo al comprobar el conjunto completo y con actualización condicional en PostgreSQL. Force pushes o comparaciones incompletas dejan error explícito y cursor intacto.

El sondeo alternativo recupera commits y releases sin exigir webhook cuando se configura conectividad y credenciales. La primera sincronización establece la línea base, sin inventar historia. La API ADMIN permite fuentes, rama, ventana, prerreleases, activación y sincronización manual.

TFLivesStudio/TFLClient permanece desactivado por defecto. No configurar webhook real ni activar publicaciones sin autorización.

## Solapamiento

Las releases conservan sus changelogs oficiales; los commits conservan sus propias referencias. No se descartan registros por similitud textual. La vinculación exhaustiva entre tags y SHAs de cada release sigue pendiente. Nunca prometer exactamente una publicación ante fallos arbitrarios de sistemas externos.
