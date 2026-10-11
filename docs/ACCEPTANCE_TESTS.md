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

## Accesos creados por administración y recorrido por rol

- [x] Administración crea el acceso de un miembro y de un profesor desde «Accesos»: usuario `ikigai-miembro-<nombre>` / `ikigai-profesor-<nombre>` y clave temporal con el formato `XX-Ikigai-XXXX-XXXX`, visible una sola vez (`accounts.integration.test.ts`, `e2e-roles.py`).
- [x] Sólo administración puede crear o restablecer accesos; un homónimo recibe un usuario distinto (apellido o número); una persona no recibe dos cuentas; la clave no queda en la base ni en la auditoría.
- [x] Con la clave temporal el servidor rechaza toda ruta salvo ver la sesión, cambiar la clave y salir (`password_change_required`); al cambiarla se cierran las demás sesiones.
- [x] «Restablecer clave» cierra las sesiones de la persona y vuelve a exigir el cambio; nunca se aplica a un administrador.
- [x] El miembro inicia sesión con su usuario, ve sólo sus secciones, reserva y cancela una clase y consulta su asistencia; las rutas de administración le responden `403` aunque el cliente las invoque.
- [x] El profesor activado ve su agenda y registra la asistencia de una clase ya dada; el miembro la ve reflejada como «Presente».
- [x] La pantalla «Accesos» no repite `id` (accesibilidad).
- [x] **Primer uso de administración** (`scripts/e2e-tour.py`): clave temporal → elegir clave propia → guía de globos que recorre 13 pantallas en orden, también en un teléfono; se puede saltar con Escape, se recuerda en el servidor (no reaparece al recargar ni en otro dispositivo) y se repite desde «Guía de primer uso».
- [ ] Probado a mano por Agustín en su propio celular.
- [x] Recorrido automatizado en navegador real con tres personas: `scripts/e2e-roles.py` (manual; el CI no tiene navegador).

## Flujos de administración y PWA en navegador real

- [x] Configuración institucional: se guarda, se recarga la página y los valores vienen del servidor; nada en `localStorage` (`scripts/e2e-admin.py`).
- [x] Servicios: alta con precio, edición del precio vigente y rechazo legible de un nombre repetido.
- [x] Membresía con precio acordado distinto del vigente del servicio: se conserva el acordado; se puede finalizar.
- [x] Cuenta corriente: cargo, pago parcial y ajuste de crédito dejan el saldo esperado (16.000 − 6.000 − 1.000 = 9.000).
- [x] Profesores: obligación mensual fija, pago parcial y ajuste negativo; el saldo y el historial se muestran consistentes (30.000 − 2.000 − 12.000 = 16.000).
- [x] Roles múltiples: vincular una cuenta de administración con un perfil de profesor conserva ambos roles tras recargar.
- [x] PWA: el service worker precachea el shell y las tipografías; el portal abre sin red; sin red las operaciones fallan con aviso de desconexión y nunca se muestran como hechas; al volver la red se recupera; ninguna respuesta de `/api/` entra en la caché; al actualizar se borran los cachés anteriores (`scripts/e2e-pwa.py`).
- [ ] Instalación como aplicación y actualización de la PWA en un dispositivo Android real.

## Avisos, ausencias y llegadas tarde

- [x] El miembro dueño de la reserva (o administración) deja, cambia y quita un aviso de ausencia o de llegada tarde; otra persona, otro profesor o un anónimo no pueden (`404`/`401`) (`notices.integration.test.ts`).
- [x] Un aviso es informativo: la reserva sigue confirmada, el cupo ocupado y la cuenta corriente intacta.
- [x] No se puede avisar sobre una reserva cancelada ni una vez empezada la clase (`409`).
- [x] El profesor de la clase ve el aviso y su nota en la lista de asistencia; la nota no se copia a la auditoría.
- [x] El profesor registra «llegó tarde» sólo para quien asistió; corregir a ausente lo limpia; repetir o corregir sin mencionarlo conserva el valor.
- [x] El historial del miembro muestra «Llegó tarde» y cuenta las llegadas tarde (`e2e-roles.py`).
- [x] Los esquemas rechazan con `400` los campos desconocidos en vez de descartarlos (`strict-schemas.test.ts`).

## Sesión: expiración, cierre y revocación

- [x] Cuando la sesión vence en el servidor la interfaz lo dice («venció»), vuelve al inicio de sesión y no deja datos de la sesión a la vista; volver a iniciar sesión recupera el uso normal (`scripts/e2e-session.py`).
- [x] Al cerrar sesión, una cookie que el navegador conserve ya no sirve (`401`).
- [x] Administración revoca las sesiones de otra persona y esa persona queda afuera en su siguiente acción.

## Protección de datos personales

- [x] El miembro exporta sólo sus datos; otra persona, un profesor o un anónimo no pueden (`404`/`401`); la exportación no incluye datos ajenos ni hashes de contraseñas y queda auditada sin su contenido (`data-protection.integration.test.ts`).
- [x] El miembro descarga su archivo desde el portal; administración exporta los datos de cualquier miembro (`e2e-roles.py`, `e2e-admin.py`).
- [x] Anonimizar exige administración, estado «baja», sin reservas futuras ni membresías abiertas, un motivo y la confirmación literal; la propia persona no puede ejecutarlo.
- [x] Tras anonimizar: no queda nombre, correo, teléfono, dirección, DNI, contacto de emergencia ni notas; la cuenta queda deshabilitada y sin sesiones; el saldo, las membresías y la asistencia se conservan; una segunda anonimización no hace nada y el perfil no se puede editar.
- [x] La exportación posterior a la anonimización no contiene ningún dato personal.
- [ ] Revisión jurídica del texto de consentimiento y de los plazos, e inscripción de la base ante la AAIP si corresponde.

## Simulaciones por rol (11/10/2026)

Se corren en este orden sobre una base descartable recién migrada, con el administrador creado con `ADMIN_MUST_CHANGE_PASSWORD=1 npm run admin:create` (ver el encabezado de cada script):

- [x] `scripts/sim-admin.py` — Agustín: primer ingreso y guía; configuración, servicios, profesores y su cuenta, miembros (editar, exportar, anonimizar), accesos (usuario y clave temporal, homónimos, restablecer), horarios y turnos fijos, clases, membresías, cuenta corriente, asistencia, ejercicios y rutinas con versiones, avisos, las 13 pantallas, vínculo administración-profesor, cambio de clave.
- [x] `scripts/sim-profesor.py` — Florencia: ve solo lo de su rol; avisos generales y de profesores (nunca los de miembros); corrige asistencia; ve su cuenta sin modificarla; ve la biblioteca de rutinas y asigna a quienes tienen clases con ella; 13 acciones de administración o de otras personas rechazadas por el servidor.
- [x] `scripts/sim-miembro.py` — Marcos, en 390 px: ve solo lo suyo; avisos generales y de miembros; membresía, cuenta (saldo 6.500) y asistencia sin poder modificarlas; reserva, avisa tarde y cancela; ve las rutinas de administración y de su profesora; corrige su contacto; descarga sus datos; 21 acciones prohibidas rechazadas.
- [ ] Repetirlas en un celular Android real conectado al servidor.
