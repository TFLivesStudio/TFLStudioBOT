# Roles y permisos

Guild único: `1264656310205415474`. ADMIN global: `1282541815802892289`. Studio no es un rol administrativo global. La incorporación humana de Discord sigue siendo obligatoria.

| Recurso | Autorización |
|---|---|
| Reportes y estadísticas | Departamentos visibles mediante roles + overwrites actuales |
| Crear reporte | Acceso de escritura real al canal/foro del departamento |
| Leer guía | Visibilidad global interna o departamento autorizado; archivo solo ADMIN |
| Editar/publicar guías y anuncios | ADMIN |
| Billing, GitHub, personal, automatizaciones, jobs, auditoría e imports | ADMIN |
| Preferencias visuales locales | Usuario del navegador; no conceden autoridad |

Cada petición protegida consulta membresía viva. La evaluación combina @everyone, roles, Administrator y overwrites de rol/miembro. Diferencia SendMessages para nuevos posts y SendMessagesInThreads para respuestas. No se asignan permisos a partir de valores enviados por el cliente ni de staff_assignments.

El worker vuelve a comprobar al solicitante de publicaciones humanas antes de la escritura remota. Si fue revocado, está pendiente o no se conoce su identidad, falla antes de publicar. Las fuentes GitHub vuelven a comprobar habilitación y flujo. Una tarea fallida conserva su registro e intentos para revisión.

El directorio está limitado a asignaciones registradas. Retirar una asignación no retira un rol de Discord. Dar de alta una asignación requiere que el miembro exista y esté aprobado, y no puede ser el propio administrador solicitante.
