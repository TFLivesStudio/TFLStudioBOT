# Recuperación y rollback

Antes de integrar 0.4, conservar el commit, lockfile e imagen anterior, un backup restaurable de PostgreSQL y la configuración privada fuera de Git. Probar la restauración en otra base: que un archivo de backup exista no demuestra que funcione.

Para rollback del código:

1. Parar el Core 0.4 y la web conectada para evitar nuevas escrituras mientras cambia el operador.
2. Volver al commit/imagen 0.3 y su configuración de origen anterior. Restaurar también las URLs OAuth/CORS que ese despliegue utilizaba; la cookie de la web 0.4 no se transfiere mágicamente al host anterior.
3. Mantener la migración 014 y sus datos: es una tabla aditiva no utilizada por 0.3. No borrar reportes, asociaciones GitHub ni sesiones para «limpiar» el esquema.
4. Arrancar solo una instancia persistente. Verificar DB, Gateway y heartbeat.
5. Revisar jobs `running`, `failed` y `needs_reconciliation` antes de cualquier reintento. El resultado de una escritura remota incierta no puede recuperarse deduciéndolo de un timeout.

Si se requiere recuperación de datos, restaurar primero en una base nueva y comprobar registros, monedas exactas, esquemas e identidades externas. Cambiar DATABASE_URL solo tras una decisión operativa autorizada. No ejecutar DROP SCHEMA ni restauraciones sobre la base activa como parte de una prueba.

Los scripts de test que eliminan schemas solo funcionan dentro de una base llamada studio_test y NODE_ENV=test. No usarlos para datos operativos. Las guías conservan revisiones y los anuncios desde 0.4; esa capacidad no reemplaza un backup de PostgreSQL.
