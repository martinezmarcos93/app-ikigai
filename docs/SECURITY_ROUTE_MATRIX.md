# Matriz de autorización del backend — Ikigai Training

Esta matriz se deriva de los guards del servidor, no de la visibilidad de botones del frontend. El estado de CI del PR de Fase 3 está pendiente porque GitHub Actions no llegó a asignar runners; por eso esta revisión de código no equivale a una ejecución de pruebas aprobada.

## Matriz por endpoint

| Endpoint | Identidad / rol permitido | Control de alcance o condición | Escritura protegida | Cobertura de prueba existente |
| --- | --- | --- | --- | --- |
| `POST /api/v1/auth/login` | Público | Credenciales locales activas; respuesta genérica | Origin + rate limit | `auth.test.ts` |
| `POST /api/v1/auth/password-reset/request` | Público | Cuenta activa/local; respuesta genérica; token de un uso y 30 min | Origin + rate limit compartido | `password-reset.integration.test.ts` |
| `POST /api/v1/auth/password-reset/confirm` | Público con token válido | Token no vencido, no usado ni revocado; cuenta local activa | Origin + transacción; revoca sesiones | `password-reset.integration.test.ts` |
| `GET /api/v1/auth/me` | Sesión válida | Sesión vigente y usuario activo | No | `auth.test.ts` |
| `POST /api/v1/auth/logout` | Sesión válida o cierre idempotente sin sesión | CSRF + Origin cuando hay sesión; Origin si no la hay | Revocación de sesión | `auth.test.ts` |
| `GET /api/v1/members` | Administración | Paginación acotada | No | `members.test.ts` |
| `GET /api/v1/members/:id` | Administración, miembro propio o profesor asignado | Alcance comprobado en servidor; campos minimizados | No | `members.test.ts` |
| `POST /api/v1/members` | Administración | Esquema de entrada y reglas de fechas/estado | CSRF + transacción + auditoría | `members.test.ts` |
| `PATCH /api/v1/members/:id` | Administración o miembro propio | Miembro sólo puede editar teléfono/dirección/contacto de emergencia; no DNI, notas ni estado | CSRF + transacción + auditoría por campos | `members.test.ts` |
| `POST /api/v1/class-sessions/:id/bookings` | Miembro autenticado | Reserva sólo para su miembro vinculado; cupo, duplicado y corte de 40 min | CSRF + transacción + bloqueo de sesión | `bookings.integration.test.ts` |
| `POST /api/v1/bookings/:id/cancel` | Administración o dueño de la reserva | Cancelación y promoción según corte/cupo | CSRF + transacción + auditoría | `bookings.integration.test.ts` |
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

## Controles transversales

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
