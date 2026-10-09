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
