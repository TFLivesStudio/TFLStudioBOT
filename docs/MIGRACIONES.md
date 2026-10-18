# PostgreSQL y migraciones

Se conservan pg y sus consultas parametrizadas. No se añadió ORM. Las migraciones viven en la raíz; el runner de packages/database resuelve su ruta desde import.meta.url, independientemente del directorio de trabajo.

Las trece migraciones originales son byte-idénticas al commit e7db70ab41dab0e818b63b275fa6f9d4fb4a1eed. Sus SHA256 se verifican en una prueba. No se alteran las asociaciones históricas de reportes, SHAs ni timestamps.

014 añade únicamente announcement_revisions: cada edición posterior conserva la versión anterior dentro de la misma transacción y con bloqueo/versión optimista. No genera revisiones históricas ficticias.

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE bun run migrate
```

El comando solo requiere DATABASE_URL. No abre Discord ni exige credenciales del bot. Guarda schema_migrations y usa advisory lock de transacción por archivo; una segunda ejecución no reaplica SQL. Los SQL contienen DDL que no debe ejecutarse manualmente dos veces fuera del runner.

La suite de upgrade crea un schema aislado dentro de studio_test, aplica 001–013, guarda datos representativos de 0.3, ejecuta 014 con el runner dos veces y comprueba cuerpos, reportes, precisión monetaria y ausencia de historial inventado. Al acabar elimina exclusivamente ese schema de prueba.

Producción: backup verificado antes del cambio, parada del Core antiguo, migración controlada y arranque de 0.4. La configuración de conexión debe corresponder al contenedor real: 127.0.0.1 dentro de un contenedor no es el host VPS. Usar red privada y nombre de servicio o dirección autorizada.

Rollback de código a 0.3 puede dejar la tabla 014 intacta; no hace falta eliminar datos para volver al código anterior. La recuperación de datos requiere restaurar un backup en otra base y validar su contenido antes de cambiar DATABASE_URL. Ver [Recuperación](RECUPERACION.md).
