# Matriz de autorización del backend — Ikigai Training

Esta matriz se deriva de los guards del servidor, no de la visibilidad de botones del frontend. El estado de CI del PR de Fase 3 está pendiente porque GitHub Actions no llegó a asignar runners; por eso esta revisión de código no equivale a una ejecución de pruebas aprobada.

## Matriz por endpoint


| Endpoint | Identidad / rol permitido | Control de alcance o condición | Escritura protegida | Cobertura de prueba existente |
| --- | --- | --- | --- | --- |
| `GET /api/v1/admin/institution-settings` | Administración | Configuración institucional de la instalación | No; `Cache-Control: no-store` | `institutional-settings.test.ts` (contrato estático; ejecución CI pendiente) |
| `PATCH /api/v1/admin/institution-settings` | Administración | Esquema estricto; campos vacíos representan no configurado | CSRF + transacción + auditoría minimizada; `no-store` | `institutional-settings.test.ts` (contrato estático; ejecución CI pendiente) |
| `POST /api/v1/admin/users/link-coach` | Administración | Sólo cuenta admin activa; email de perfil y cuenta debe coincidir; perfil no vinculado a otra cuenta | CSRF + transacción + auditoría; añade coach sin revocar admin | `admin-role-link.test.ts` (contrato estático; ejecución CI pendiente) |
| `POST /api/v1/auth/login` | Público | Credenciales locales activas; respuesta genérica | Origin + rate limit | `auth.test.ts` |
| `POST /api/v1/auth/password-reset/request` | Público | Cuenta activa/local; respuesta genérica; token de un uso y 30 min | Origin + rate limit compartido | `password-reset.integration.test.ts` |
| `POST /api/v1/auth/password-reset/confirm` | Público con token válido | Token no vencido, no usado ni revocado; cuenta local activa | Origin + transacción; revoca sesiones | `password-reset.integration.test.ts` |
| `GET /api/v1/auth/me` | Sesión válida | Sesión vigente y usuario activo | No | `auth.test.ts` |
| `POST /api/v1/auth/logout` | Sesión válida o cierre idempotente sin sesión | CSRF + Origin cuando hay sesión; Origin si no la hay | Revocación de sesión | `auth.test.ts` |
| `POST /api/v1/auth/tour-completed` | Sesión válida | Solo marca la propia guía de primer uso como vista | CSRF | `accounts.integration.test.ts` |
| `POST /api/v1/auth/change-password` | Sesión válida (también con clave temporal pendiente) | Exige la clave actual; la nueva ≥ 12 caracteres y distinta; cierra las demás sesiones | CSRF + rate limit + auditoría | `accounts.integration.test.ts` |
| `GET /api/v1/members` | Administración | Paginación acotada | No | `members.test.ts` |
| `GET /api/v1/members/:id` | Administración, miembro propio o profesor asignado | Alcance comprobado en servidor; campos minimizados | No | `members.test.ts` |
| `POST /api/v1/members` | Administración | Esquema de entrada y reglas de fechas/estado | CSRF + transacción + auditoría | `members.test.ts` |
| `PATCH /api/v1/members/:id` | Administración o miembro propio | Miembro sólo puede editar teléfono/dirección/contacto de emergencia; no DNI, notas ni estado | CSRF + transacción + auditoría por campos | `members.test.ts` |
| `GET /api/v1/class-sessions` | Administración, miembro vinculado o profesor | Ventana de 90 días máximo y paginación acotada; el profesor sin otro rol sólo ve las clases de su propio perfil (exige perfil vinculado); cada fila incluye sólo la reserva propia del actor | No; `Cache-Control: no-store` | `route-security.test.ts` (anónimo rechazado); alcance de profesor por confirmar en integración |
| `GET /api/v1/class-templates` | Administración o profesor con perfil vinculado | El profesor sólo ve sus propias plantillas | No; `Cache-Control: no-store` | `route-security.test.ts`; `schedule.integration.test.ts` |
| `POST /api/v1/class-templates` | Administración | Servicio y profesor activos; horario local con zona horaria del gimnasio; un profesor no repite día y hora activos | CSRF + transacción + auditoría | `schedule.integration.test.ts` |
| `PATCH /api/v1/class-templates/:id` | Administración | Cambia capacidad, duración, profesor o estado; no reescribe instancias ya generadas | CSRF + transacción + auditoría con antes/después | `schedule.integration.test.ts` |
| `POST /api/v1/class-sessions/generate` | Administración | Rango máximo de 90 días; idempotente (misma plantilla y horario no se duplican); reserva a quienes tienen turno fijo vigente respetando el cupo | CSRF + transacción + auditoría | `schedule.integration.test.ts` |
| `POST /api/v1/class-sessions/:id/cancel` | Administración | Sólo instancias programadas que no empezaron; libera reservas sin efecto financiero | CSRF + transacción + bloqueo de fila + auditoría | `schedule.integration.test.ts` |
| `GET /api/v1/class-templates/:id/assignments` | Administración | Turnos fijos vigentes de la plantilla | No; `Cache-Control: no-store` | `route-security.test.ts`; `schedule.integration.test.ts` |
| `POST /api/v1/class-templates/:id/assignments` | Administración | Plantilla activa y miembro que no dejó el gimnasio; un solo turno fijo activo por miembro y plantilla | CSRF + transacción + auditoría | `schedule.integration.test.ts` |
| `POST /api/v1/recurring-assignments/:id/end` | Administración | Termina el turno fijo; las reservas ya generadas no se tocan y se informa cuántas quedan | CSRF + transacción + bloqueo de fila + auditoría | `schedule.integration.test.ts` |
| `POST /api/v1/class-sessions/:id/bookings` | Miembro autenticado | Reserva sólo para su miembro vinculado; cupo, duplicado y corte de 40 min | CSRF + transacción + bloqueo de sesión | `bookings.integration.test.ts` |
| `PUT /api/v1/bookings/:id/notice` | Miembro dueño de la reserva o administración | Reserva no cancelada y clase que no empezó; quien no es dueño ni administrador recibe `404`. Informativo: no cancela la reserva, no libera cupo, no genera cargos ni sanciones | CSRF + transacción + bloqueo de la reserva + auditoría | `notices.integration.test.ts` |
| `DELETE /api/v1/bookings/:id/notice` | Miembro dueño de la reserva o administración | Igual que el anterior; quitar un aviso inexistente es idempotente | CSRF + transacción + bloqueo + auditoría | `notices.integration.test.ts` |
| `POST /api/v1/bookings/:id/cancel` | Administración o dueño de la reserva | Cancelación y promoción según corte/cupo | CSRF + transacción + auditoría | `bookings.integration.test.ts` |
| `GET /api/v1/members/:id/export` | Administración o miembro propio | Exportación de los datos personales de ese miembro y sólo de él; quien no es el titular ni administración recibe `404`; no incluye hashes de contraseñas ni datos de otras personas | No; `no-store` + `Content-Disposition: attachment`; queda auditada sin su contenido | `data-protection.integration.test.ts` |
| `POST /api/v1/members/:id/anonymize` | Administración | Sólo de quien dejó el gimnasio (`exited`), sin reservas futuras ni membresías abiertas; exige motivo y la confirmación literal `ANONIMIZAR`; conserva movimientos de cuenta, membresías y asistencia sin identidad; cierra la cuenta y sus sesiones; idempotente | CSRF + transacción + bloqueo de fila + auditoría con motivo | `data-protection.integration.test.ts` |
| `GET /api/v1/members/:id/ledger-entries` | Administración o miembro propio | No permite consultar la cuenta de otro miembro | No | `financial-rules.integration.test.ts` |
| `POST /api/v1/members/:id/ledger-entries` | Administración | Clave de idempotencia, importes exactos y motivo de ajuste | CSRF + transacción + auditoría | `financial-rules.integration.test.ts` |
| `GET /api/v1/coaches` | Administración | Directorio completo sólo para administración | No | Cobertura de rol debe confirmarse en ejecución |
| `POST /api/v1/coaches` | Administración | Esquema de entrada | CSRF + transacción + auditoría | Cobertura de rol debe confirmarse en ejecución |
| `GET /api/v1/coaches/:id/obligations` | Administración o profesor propio | Profesor sólo ve su propio ID | No | `financial-rules.integration.test.ts` |
| `POST /api/v1/coaches/:id/obligations` | Administración | Importe mensual fijo acordado y período único | CSRF + transacción + auditoría | `financial-rules.integration.test.ts` |
| `POST /api/v1/coach-obligations/:id/payments` | Administración | Imputación al período, pagos parciales e idempotencia | CSRF + transacción + auditoría | `financial-rules.integration.test.ts` |
| `POST /api/v1/coach-obligations/:id/adjustments` | Administración | Ajuste trazable con motivo | CSRF + transacción + auditoría | `financial-rules.integration.test.ts` |
| `GET /api/v1/class-sessions/:id/attendance` | Administración o profesor asignado a esa clase | Profesor debe ser el responsable de la instancia | No | `attendance.integration.test.ts` |
| `PUT /api/v1/class-sessions/:id/attendance` | Administración o profesor asignado a esa clase | Cada reserva pertenece a la instancia; IDs duplicados rechazados | CSRF + transacción + auditoría | `attendance.integration.test.ts` |
| `GET /api/v1/members/:id/attendance` | Administración o miembro propio | Historial limitado al miembro | No | `attendance.integration.test.ts` |
| `GET /api/v1/exercises` | Administración o profesor | Miembro no accede al catálogo de edición | No | `routines.integration.test.ts` |
| `POST /api/v1/exercises` | Administración | Esquema de ejercicio | CSRF + transacción + auditoría | `routines.integration.test.ts` |
| `GET /api/v1/routines` | Administración o profesor | Miembro usa la ruta de asignaciones propias | No | `routines.integration.test.ts` |
| `POST /api/v1/routines` | Administración | Versión inicial validada | CSRF + transacción + auditoría | `routines.integration.test.ts` |
| `POST /api/v1/routines/:id/versions` | Administración | Versiones históricas inmutables | CSRF + transacción + auditoría | `routines.integration.test.ts` |
| `GET /api/v1/members/:id/routine-assignments` | Administración, miembro propio o profesor asignado | Alcance por asignación/clase | No | `routines.integration.test.ts` |
| `POST /api/v1/members/:id/routine-assignments` | Administración o profesor asignado | Profesor no puede asignar a un miembro fuera de su alcance | CSRF + transacción + auditoría | `routines.integration.test.ts` |
| `GET /api/v1/services` | Cualquier usuario autenticado | Servicios inactivos sólo visibles para administración | No | `memberships.integration.test.ts` |
| `POST /api/v1/services` | Administración | Esquema y precio exacto | CSRF + transacción + auditoría | `memberships.integration.test.ts` |
| `PATCH /api/v1/services/:id` | Administración | Cambios actuales no reescriben precios históricos | CSRF + transacción + auditoría minimizada | `memberships.integration.test.ts` |
| `GET /api/v1/members/:id/memberships` | Administración o miembro propio | Historial de membresías propio | No | `memberships.integration.test.ts` |
| `POST /api/v1/members/:id/memberships` | Administración | Precio acordado, vigencia, idempotencia | CSRF + transacción + auditoría | `memberships.integration.test.ts` |
| `POST /api/v1/memberships/:id/end` | Administración | Fin de vigencia auditado; no genera multa ni devolución automática | CSRF + transacción + auditoría | `memberships.integration.test.ts` |
| `POST /api/v1/admin/invitations` | Administración | Vincula sólo perfil no vinculado; token de un uso | CSRF + transacción + rate limit + auditoría | `invitations.integration.test.ts` |
| `POST /api/v1/admin/invitations/:id/resend` | Administración | Revoca token anterior y emite otro | CSRF + transacción + rate limit + auditoría | `invitations.integration.test.ts` |
| `POST /api/v1/admin/invitations/:id/revoke` | Administración | Sólo invitación pendiente | CSRF + transacción + rate limit + auditoría | `invitations.integration.test.ts` |
| `POST /api/v1/auth/accept-invitation` | Público con token válido | Token de un uso, expiración y cuenta deshabilitada | Origin + transacción + auditoría | `invitations.integration.test.ts` |
| `POST /api/v1/admin/users/:id/reset-access` | Administración | Sólo cuentas de miembro/profesor; requiere motivo; no permite reset de admins | CSRF + transacción + rate limit + auditoría | `admin-security.integration.test.ts` |
| `POST /api/v1/admin/users/:id/sessions/revoke` | Administración | Revocación idempotente de sesiones del usuario objetivo | CSRF + transacción + rate limit + auditoría | `admin-security.integration.test.ts` |
| `POST /api/v1/admin/backup` | Administración | Descarga la base completa cifrada con una frase elegida por quien la pide (mín. 12 caracteres); excluye sesiones, claves de recuperación e invitaciones pendientes | CSRF + lectura repetible de solo lectura + rate limit (3 cada 10 min) + auditoría (totales, no datos); `no-store` | `backup.test.ts` |
| `GET /api/v1/announcements` | Cualquier usuario autenticado | Cada persona ve lo general y lo de su rol (administración ve todo); sin archivados | No | `announcements.integration.test.ts` |
| `POST /api/v1/admin/announcements` | Administración | Título, texto y destinatarios (todos, miembros o profesores) | CSRF + rate limit + auditoría (sólo destinatarios, no el texto) | `announcements.integration.test.ts` |
| `POST /api/v1/announcements/:id/read` | Cualquier usuario autenticado | Sólo avisos que le corresponden; idempotente | CSRF | `announcements.integration.test.ts` |
| `POST /api/v1/admin/announcements/:id/archive` | Administración | Deja de mostrarse; no se borra | CSRF + rate limit + auditoría | `announcements.integration.test.ts` |
| `GET /api/v1/coach/members` | Profesor | Sólo miembros con quienes tiene clases (mismo alcance que asistencia y rutinas); nombre y estado | No | `announcements.integration.test.ts` |
| `GET /api/v1/admin/accounts` | Administración | Miembros y profesores con su usuario y estado de acceso (nunca claves) | No | `accounts.integration.test.ts` |
| `POST /api/v1/admin/accounts` | Administración | Crea el usuario y una clave temporal aleatoria de un solo uso visible; exige cambio en el primer ingreso; un perfil, una cuenta | CSRF + transacción + rate limit + auditoría (sin la clave) | `accounts.integration.test.ts` |
| `POST /api/v1/admin/accounts/:id/reset-password` | Administración | Sólo cuentas de miembro/profesor, nunca administradores; cierra sus sesiones y exige nuevo cambio | CSRF + transacción + rate limit + auditoría | `accounts.integration.test.ts` |
| `POST /api/v1/admin/accounts/:id/disable` | Administración | Sólo cuentas de miembro/profesor activas, nunca administradores; pasa a `suspended`, cierra sus sesiones al instante y no puede volver a entrar; no borra ni anonimiza nada | CSRF + transacción + rate limit + auditoría | `access-control.integration.test.ts` |
| `POST /api/v1/admin/accounts/:id/enable` | Administración | Sólo cuentas `suspended` de miembro/profesor; vuelven a entrar con su clave de siempre | CSRF + transacción + rate limit + auditoría | `access-control.integration.test.ts` |

## Controles transversales

- **Autenticación antes de validación:** un hook `preValidation` global exige sesión válida en toda ruta que no esté en `PUBLIC_ROUTES` (`src/app.ts`); un anónimo recibe `401` y no puede sondear los esquemas de entrada. Los handlers siguen autorizando por rol y alcance, reutilizando la misma resolución de sesión del request.
- **Auditoría automática de esta matriz:** `server/test/route-security.test.ts` enumera todas las rutas registradas y falla si (a) una ruta no tiene fila aquí o una fila no tiene ruta, (b) una ruta privada responde a un anónimo, o (c) una ruta marcada «Administración» deja pasar a un miembro o a un profesor con sesión y CSRF válidos.

- Toda ruta privada debe resolver la sesión en el servidor; los roles del navegador no son fuente de autoridad.
- Las escrituras autenticadas validan CSRF y Origin; los endpoints públicos de autenticación validan Origin.
- Las rutas de autenticación y datos privados deben responder con `Cache-Control: no-store`.
- La validación de esquema rechaza propiedades desconocidas y acota tamaños/listas.
- Las operaciones financieras, reservas, asistencia y cambios de acceso deben permanecer transaccionales e idempotentes donde corresponde.
- Los logs/auditoría no deben incluir contraseñas, tokens de sesión/recuperación, DNI, emails o teléfonos salvo una necesidad explícita aprobada.

## Estado de cobertura y salida

Las pruebas nombradas existen en el repositorio; **no se marca esta matriz como aprobada** hasta que CI ejecute los tests de unidad e integración y se revisen los resultados. Los tests de autorización negativa deben mantenerse y ampliarse si se añade cualquier endpoint o rol nuevo. La revisión de seguridad independiente, el adaptador real de correo y la política de backup/restore de producción siguen siendo gates antes de datos reales.


## Pruebas transversales adicionales

- `server/test/rate-limit.integration.test.ts`: comprueba que dos instancias de API con pools PostgreSQL independientes comparten el contador de intentos; el identificador persistido se deriva mediante HMAC-SHA-256 con `SESSION_SECRET`.
- `server/test/config.test.ts`: verifica que la URL pública de recuperación no contiene credenciales, query ni fragmento y que su origen está incluido en CORS.
- `server/test/password-reset.integration.test.ts`: confirma que el token está en el fragmento URL y no en la query, que sólo se almacena su digest y que el adaptador recibe el evento de entrega esperado.

La existencia de estas pruebas no equivale a aprobación; el estado sólo puede cambiar tras ejecutar y revisar CI.


## Cobertura de autorización adicional

- `server/test/authorization.test.ts` verifica los invariantes del helper de alcance: miembro propio, rechazo de perfil ajeno, profesor con perfil vinculado y alcance confirmado, profesor sin vínculo, administrador y roles mixtos.
- `server/test/attendance.integration.test.ts` comprueba que el profesor asignado puede consultar la asistencia y que otro profesor recibe `404` tanto al leer como al intentar escribir.

La matriz completa de rutas continúa pendiente de aprobación hasta revisar todos los tests de integración en una ejecución verde y obtener revisión independiente.
