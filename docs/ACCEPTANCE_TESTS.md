# Pruebas de aceptación funcional — Ikigai Training

## Reserva y lista de espera
- [ ] Una persona activa puede reservar una instancia futura antes del corte de 40 minutos.
- [ ] Se rechaza una reserva cuando faltan 40 minutos o menos para el inicio.
- [ ] Se rechaza una fecha pasada.
- [ ] La misma persona no puede crear dos reservas activas para la misma instancia.
- [ ] Si hay cupo, la reserva queda confirmada.
- [ ] Si está completo, la persona entra en lista de espera y no consume capacidad.
- [ ] Cancelar una confirmada antes del corte promueve a la persona más antigua en espera.
- [ ] La promoción no puede hacer que las confirmadas superen la capacidad.
- [ ] Una reserva en espera cancelada no libera un cupo confirmado ni promueve innecesariamente.
- [ ] Se muestra claramente si cada turno está confirmado o en espera.

## Asistencia
- [ ] Se puede guardar la asistencia para todas las reservas confirmadas de una instancia.
- [ ] Volver a abrir la asistencia recupera lo guardado.
- [ ] Corregir presente/ausente actualiza el registro sin duplicarlo.
- [ ] Guardar dos veces no duplica la asistencia ni incrementa dos veces el contador.
- [ ] No hay una clase con asistencia registrada para un miembro que no tenga reserva, salvo que se implemente explícitamente asistencia sin reserva.

## Obligaciones de profesores
- [ ] Un profesor sin importe mensual configurado aparece como “Sin configurar”; no se muestra saldo cero.
- [ ] Se pueden registrar uno o varios pagos parciales para un período.
- [ ] El total pagado y el saldo se calculan para el período seleccionado.
- [ ] El exceso de pago se identifica como saldo a favor.
- [ ] Cambiar la obligación mensual no reescribe pagos anteriores.
- [ ] Reservas y asistencia no cambian el importe que el profesor debe al gimnasio.
- [ ] No se presenta ninguna participación porcentual como modelo económico vigente.

## Capacidad y agenda
- [ ] Cada franja tiene su propia capacidad.
- [ ] La capacidad acepta enteros dentro del rango validado y rechaza cero, negativos y decimales.
- [ ] Las métricas cuentan sólo reservas confirmadas como ocupación.
- [ ] La lista de espera se muestra separada de los cupos ocupados.

## Móvil Android
- [ ] A 320, 360, 390, 412 y 480 px no aparece scroll horizontal global.
- [ ] Las tablas pueden desplazarse dentro de su contenedor sin mover toda la página.
- [ ] El teclado virtual no tapa el botón de guardar en formularios largos.
- [ ] Los modales admiten scroll interno.
- [ ] El menú móvil se cierra por navegación, Escape o toque fuera.
- [ ] No hay acciones importantes dependientes sólo de hover.
- [ ] Se valida Chrome Android en al menos un dispositivo de gama baja y uno de gama media/alta, además de emulación.

## Seguridad / preproducción
- [ ] Cambiar el rol en el navegador no concede permisos reales.
- [ ] Las pruebas de API comprueban acceso cruzado entre dos miembros.
- [ ] Los profesores no pueden leer datos de miembros ajenos a su alcance.
- [ ] Se auditan pagos, cambios de membresía, cancelaciones y correcciones de asistencia.
- [ ] Se verifican copias de seguridad y recuperación antes de importar datos reales.


## API authentication foundation
- [ ] Login accepts only valid JSON and normalizes email addresses.
- [ ] Wrong email and wrong password use the same public error response.
- [ ] Unknown accounts do not bypass password-hashing work.
- [ ] Login rejects missing or unconfigured browser origins.
- [ ] Session tokens are opaque, random, and stored only as SHA-256 digests.
- [ ] Session cookies are HttpOnly, SameSite=Strict and Secure in production.
- [ ] Session expiry and revocation are enforced by the server on every authenticated request.
- [ ] Logout requires the expected Origin and a valid CSRF token, then revokes the server-side session.
- [ ] Authentication responses are marked no-store.
- [ ] Production startup fails when DATABASE_URL, CORS_ORIGINS or a sufficiently long SESSION_SECRET is missing.
- [ ] Login rate limiting is verified; production multi-instance deployments use a shared rate-limit store.
- [ ] Cross-member and cross-coach authorization tests pass before any business-data endpoint is released.


## PostgreSQL-backed booking API
- [ ] Two concurrent requests for the last place produce exactly one confirmed booking; the other enters the waitlist.
- [ ] Confirmed bookings never exceed the session capacity.
- [ ] A duplicate active booking for the same member/session is rejected.
- [ ] A booking request inside the 40-minute cutoff is rejected by server time.
- [ ] A member cannot book on behalf of another member or access a booking owned by another member.
- [ ] Cancellation inside the 40-minute cutoff is rejected.
- [ ] Cancelling a confirmed booking before cutoff promotes the oldest waiting booking in the same transaction.
- [ ] Cancelling a waitlisted booking does not promote another member.
- [ ] A failed booking/cancellation transaction leaves no partial state changes.


## Member profile write authorization
- [ ] An active member can update only their own phone, address and emergency contact fields.
- [ ] A member cannot change their status, name, email, DNI, join/exit dates or internal notes.
- [ ] An administrator can update operational profile fields through a validated allowlist.
- [ ] Profile updates require an allowed Origin and a valid CSRF token.
- [ ] Profile changes and audit records commit or roll back together.
- [ ] Audit records list changed fields and status transitions without copying contact details or DNI into the audit payload.
- [ ] Invalid date ranges and unique/conflict errors return stable client errors rather than generic server errors.


## Account ledger API
- [ ] Account balance is derived from exact debit/credit movements, not stored as an independently editable total.
- [ ] Members can read only their own account history; coaches cannot access financial ledgers.
- [ ] Only administration can create charges, payments, adjustments and refunds.
- [ ] A charge increases the balance; a payment/refund decreases it; adjustments require explicit debit/credit direction.
- [ ] Duplicate Idempotency-Key with the same request returns the original movement without changing the balance.
- [ ] Reusing an Idempotency-Key with a different request returns a conflict.
- [ ] Ledger movement and audit event commit atomically; ledger history cannot be updated or deleted.
- [ ] Partial payments remain separate movements; no automatic penalties or percentage-based coach share is introduced.
- [ ] Payment receipts are labelled internal and are not represented as fiscal invoices.


## Coach monthly obligations and payments
- [ ] An unconfigured coach/month has no obligation and returns a null balance, not a fabricated zero obligation.
- [ ] One fixed obligation can be configured per coach and month; retries with the same terms do not duplicate it.
- [ ] A different amount for an already configured coach/month returns a conflict rather than rewriting history.
- [ ] Partial and excess payments are recorded separately and attributed to the obligation period.
- [ ] A correction is an append-only signed adjustment with a required reason; prior payments/obligations are never overwritten.
- [ ] Payment and adjustment Idempotency-Key retries do not duplicate financial records; a changed request with the same key conflicts.
- [ ] The balance is agreed obligation plus adjustments minus payments; a negative balance is a credit in favor of the coach.
- [ ] Coaches can read only their own obligation; only administrators can create obligations, payments and adjustments.
- [ ] No amount is calculated from class reservations, attendance or percentage share.


## Attendance API
- [ ] Only administration or the coach assigned to a class can read/record attendance for that class.
- [ ] Members can read only their own attendance history and cannot change attendance.
- [ ] Only confirmed bookings in the requested class session may receive attendance records.
- [ ] Duplicate booking IDs in one update are rejected before any write.
- [ ] Recording the same value twice is idempotent; corrections update the record without duplicating it.
- [ ] Attendance writes and their audit events commit atomically.
- [ ] A cancelled session cannot receive attendance changes.
- [ ] A coach cannot read attendance for a class assigned to another coach.


## Exercises, routines and assignments
- [ ] Only administration can create exercises, routines and new routine versions.
- [ ] Routine versions are immutable; creating a new version does not change an existing member assignment.
- [ ] Every exercise reference in a routine version must point to an active exercise.
- [ ] Each routine exercise has sets and either repetitions or duration.
- [ ] Administration can assign a routine version to a member; a coach can do so only for a member in their scope.
- [ ] Repeating an identical assignment is idempotent; conflicting terms for the same member/version/start date return a conflict.
- [ ] A member can read only their own assignments and cannot browse the full routine catalogue or create routines.
- [ ] Assignment and routine-version changes are audited transactionally.


## Fase 3 — Seguridad y recuperación de acceso

- [ ] La solicitud de recuperación devuelve el mismo estado y texto para emails existentes y desconocidos; no expone el token ni confirma la existencia de una cuenta.
- [ ] El token de recuperación se almacena sólo como SHA-256, vence a los 30 minutos, invalida tokens anteriores y no puede reutilizarse.
- [ ] El token se entrega en el fragmento de URL; la página lo elimina del historial visible tras leerlo y no carga recursos de terceros.
- [ ] Confirmar el cambio de contraseña revoca todas las sesiones activas y deja evidencia de auditoría sin incluir el token.
- [ ] La recuperación requiere origen permitido; las solicitudes sensibles tienen respuestas no cacheables y rate limiting compartido entre instancias.
- [ ] El límite compartido rechaza la cuarta solicitud de recuperación dentro de la ventana horaria, aunque se alternen dos instancias API.
- [ ] Los eventos de auditoría no contienen emails, contraseñas, tokens, DNI ni teléfonos; se registran sólo identificadores, campos modificados y datos operativos necesarios.
- [ ] El ensayo de backup/restore restaura esquema, historial de migraciones y datos en una base PostgreSQL descartable.
- [ ] En producción, el adaptador de correo está configurado con HTTPS y secretos de despliegue; no se registra el enlace completo.
- [ ] La revisión independiente, la política de backups de producción y las pruebas negativas completas de permisos están aprobadas antes de introducir datos reales.

## Recuperación de contraseña

- [ ] La solicitud devuelve una respuesta pública genérica para cuentas existentes y desconocidas.
- [ ] La URL de recuperación lleva el token sólo en el fragmento; no aparece en la query ni en auditoría.
- [ ] El token se almacena como digest, vence a los 30 minutos, es de un solo uso e invalida tokens anteriores.
- [ ] Si falla la entrega, el token emitido queda revocado o inutilizable.
- [ ] Completar recuperación cambia la contraseña y revoca todas las sesiones activas.
- [ ] La pantalla lee el fragmento y lo elimina inmediatamente del historial del navegador.
- [ ] La configuración de producción rechaza URL sin HTTPS, con credenciales, query/fragment o un origen fuera de CORS.
- [ ] El rate limit compartido se verifica entre dos instancias API con pools PostgreSQL separados.
- [ ] La restauración de backup se verifica en una base descartable; no se confunde con backups de producción configurados.

## Autorización de asistencia y rutinas

- [ ] El miembro puede leer sólo su propio historial de asistencia; el acceso cruzado devuelve `404`.
- [ ] El profesor asignado a una sesión puede consultar y corregir asistencia; otro profesor no puede leer ni escribir esa sesión.
- [ ] Los endpoints de rutinas permiten alcance propio del miembro y alcance del profesor sólo cuando existe una asignación vigente o reserva dentro de la ventana definida.
- [ ] Los intentos de escritura de miembros en endpoints exclusivos de administración/profesores son rechazados en el servidor, aunque el cliente invoque la API directamente.

## Agenda recurrente (plantillas, generación y turnos fijos)

- [x] Sólo administración crea y modifica plantillas; miembros y profesores reciben `403` (`schedule.integration.test.ts`, `route-security.test.ts`).
- [x] Un profesor no puede tener dos plantillas activas el mismo día y hora (`409 template_slot_taken`).
- [x] Generar clases convierte la hora local a instante en la zona del gimnasio: 19:30 en Buenos Aires queda en 22:30 UTC.
- [x] Generar el mismo rango dos veces no duplica clases ni reservas; un rango de más de 90 días o invertido se rechaza.
- [x] Cambiar la capacidad de una plantilla no modifica las clases ya generadas.
- [x] Un turno fijo reserva al miembro en cada clase generada; con cupo lleno queda en lista de espera.
- [x] Cancelar una clase libera las reservas y no genera movimientos en la cuenta corriente.
- [x] Terminar un turno fijo no cancela reservas ya generadas e informa cuántas quedan.
- [x] Recorrido completo en un navegador real contra la API y PostgreSQL: `scripts/e2e-agenda.py` (manual; el CI no tiene navegador).
- [ ] Revisión visual del flujo de «Horarios» en 320–480 px y en un dispositivo Android real.

## Alta por invitación y recorrido por rol

- [x] Administración invita a un miembro y a un profesor desde «Accesos» y obtiene un enlace de un solo uso con el token en el fragmento de la URL (nunca en la query).
- [x] La pantalla `accept-invitation.html` activa la cuenta, quita el token de la barra de direcciones y rechaza con un mensaje claro un enlace ya usado, vencido o inválido.
- [x] El miembro activado inicia sesión, ve sólo sus secciones, reserva y cancela una clase y consulta su asistencia; las rutas de administración le responden `403` aunque el cliente las invoque.
- [x] El profesor activado ve su agenda y registra la asistencia de una clase ya dada; el miembro la ve reflejada como «Presente».
- [x] Los formularios de invitación de miembro y de profesor no comparten `id` (accesibilidad).
- [x] Recorrido automatizado en navegador real con tres personas: `scripts/e2e-roles.py` (manual; el CI no tiene navegador).
