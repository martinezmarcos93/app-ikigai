# Arquitectura propuesta de backend y seguridad — Ikigai Training

## Decisión de arquitectura

La demo actual seguirá funcionando como prototipo local mientras se construye la versión multiusuario en paralelo. No conectar datos reales a `localStorage` ni intentar convertir el selector de rol en autenticación.

Propuesta base para la primera versión de producción:
- **Frontend:** mantener la interfaz web responsive/PWA y migrar gradualmente las operaciones desde `app.js` a una capa de cliente API.
- **API:** Node.js LTS + TypeScript + Fastify, con contratos HTTP explícitos y validación de entrada en cada endpoint.
- **Persistencia:** PostgreSQL administrado, con migraciones versionadas y restricciones en base de datos para invariantes críticas.
- **Autenticación:** sesiones seguras mediante cookies `HttpOnly`, `Secure` en producción y política `SameSite` apropiada; flujo de recuperación de acceso y cierre de sesión. No guardar tokens de sesión en `localStorage`.
- **Autorización:** RBAC más alcance por recurso, aplicado en el servidor en cada petición. El cliente sólo mejora la experiencia; nunca decide permisos efectivos.
- **Pruebas:** pruebas unitarias de dominio, integración API/base de datos y pruebas de autorización negativas. CI debe bloquear merges ante fallos.
- **Operación:** secretos en variables del entorno del proveedor, HTTPS, logs estructurados sin datos sensibles, backups automáticos y procedimiento probado de restauración.

La elección de PostgreSQL responde a la necesidad de mantener historial financiero, relaciones entre miembros/membresías/reservas, restricciones de unicidad y transacciones. Fastify y TypeScript dan un backend explícito sin exigir reescribir de una vez toda la interfaz. El proveedor de hosting y la autenticación definitiva se pueden elegir antes de la Fase 2, pero no deben alterar los requisitos de seguridad de este documento.

## Límites de confianza

1. El navegador es un entorno no confiable: cualquier usuario puede modificar JavaScript, almacenamiento local, solicitudes y parámetros.
2. Toda lectura y escritura de datos privados pasa por una autorización de servidor.
3. No aceptar `userId`, rol o alcance enviado por el cliente como prueba de identidad.
4. Los permisos se derivan de la sesión autenticada y de asignaciones almacenadas en la base de datos.
5. Los datos semilla actuales son ficticios; no se migran como información operativa.
6. El modo demo permanece claramente separado de producción y no comparte credenciales ni base de datos con ella.

## Roles y alcance

| Rol | Alcance mínimo |
| --- | --- |
| Administración | Gestiona miembros, servicios, membresías, agenda, cuentas, profesores, rutinas y configuración del gimnasio. |
| Profesor | Accede sólo a clases y miembros asignados; registra asistencia dentro de ese alcance y usa/asigna rutinas según permisos acordados. No consulta cuentas financieras generales. |
| Miembro | Consulta y modifica sólo los datos personales habilitados de su propia ficha; ve sus membresías, reservas, avisos y rutinas asignadas. |
| Sin sesión | Sólo acceso a páginas públicas de acceso/recuperación. |

Cada endpoint debe definir explícitamente el permiso requerido y el alcance de los recursos. Por ejemplo, un profesor no puede obtener una ficha ajena cambiando un ID en la URL. Las pruebas deben comprobar el acceso denegado aunque la solicitud se construya manualmente sin pasar por la interfaz.

## Entidades mínimas de producción

- `users`: identidad de acceso, email normalizado, hash/identificador del proveedor de autenticación, estado y fechas.
- `user_roles`: rol y vigencia; evitar confiar en un rol guardado sólo en el navegador.
- `members`, `coaches`: perfiles operativos vinculados opcionalmente a una identidad de acceso.
- `services`, `memberships`: catálogo y condiciones con vigencia histórica.
- `ledger_entries`: cargos, pagos, ajustes y devoluciones como movimientos inmutables; las correcciones se realizan con nuevos movimientos trazables.
- `class_templates`, `class_sessions`: separar la agenda semanal recurrente de cada instancia concreta por fecha.
- `recurring_assignments`, `bookings`: turnos habituales y reservas puntuales como conceptos distintos.
- `attendance_records`: asistencia por instancia/reserva, con autor y marcas de tiempo.
- `coach_obligations`, `coach_payments`: obligación mensual acordada y pagos imputados a períodos; no vincular el importe a reservas o asistencia.
- `exercises`, `routines`, `routine_versions`, `routine_assignments`: catálogo, versiones e historial de asignaciones.
- `announcements`, `audit_events`: avisos y auditoría de acciones críticas.

Todas las tablas operativas deben incluir claves, relaciones, índices y restricciones adecuadas. Usar fechas y horas con zona horaria definida para eventos; guardar instancias de clase con una zona horaria de gimnasio explícita. Los importes monetarios se guardan como decimales exactos o unidades mínimas enteras, nunca como `float`.

## Reglas transaccionales críticas

- **Cupo y reserva:** la comprobación de capacidad y la creación/promoción de una reserva ocurren en una transacción para impedir sobreventa por dos solicitudes simultáneas. Índices únicos impiden reservas activas duplicadas por miembro e instancia.
- **Corte de 40 minutos:** el servidor calcula el corte usando la hora real de la instancia; no confía en el reloj del navegador.
- **Lista de espera:** ordenar por fecha/hora de alta y promover una sola persona dentro de la misma transacción que libera el cupo, siempre que la regla de corte permita la promoción.
- **Asistencia:** una clave única por reserva/instancia evita duplicados; toda corrección conserva actor, fecha y valor anterior/nuevo en auditoría.
- **Cuenta corriente:** los movimientos históricos no se sobrescriben para simular una corrección. Un ajuste o reversión crea un nuevo movimiento.
- **Obligaciones de profesores:** obligación mensual y pagos parciales se registran por período; no se derivan de reservas, alumnos ni asistencia. Un importe sin acordar es nulo/no configurado, no cero.
- **Idempotencia:** operaciones sensibles a doble clic/reintento deben usar claves idempotentes o restricciones equivalentes.

## Contratos de API iniciales

Prefijo versionado: `/api/v1`. Los nombres son un contrato inicial a validar antes de implementarlo.

| Área | Endpoints iniciales | Control clave |
| --- | --- | --- |
| Sesión | `POST /auth/login`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me` | Limitación de intentos, mensajes que no revelen si un email existe, cookies seguras y protección CSRF cuando corresponda. |
| Miembros | `GET/POST /members`, `GET/PATCH /members/:id` | Administración; profesor sólo para miembros asignados y campos autorizados; miembro sólo su ficha permitida. |
| Membresías/cuenta | `GET/POST /members/:id/memberships`, `GET/POST /members/:id/ledger-entries` | Administración; miembro sólo lectura de su propia cuenta si se habilita. |
| Agenda | `GET/POST /class-templates`, `GET /class-sessions?from=&to=` | Administración configura; roles limitados consultan su alcance. |
| Reservas | `POST /class-sessions/:id/bookings`, `POST /bookings/:id/cancel` | Validación transaccional de estado, duplicados, cupo, alcance y corte. |
| Asistencia | `GET/PUT /class-sessions/:id/attendance` | Administración o profesor asignado; no se aceptan miembros ajenos al alcance. |
| Profesores | `GET/POST /coaches`, `POST /coaches/:id/payments` | Finanzas sólo para administración; obligación y pago mensual separados de clases. |
| Rutinas | `GET/POST /routines`, `POST /members/:id/routine-assignments` | Sólo administración crea ejercicios/rutinas; profesor opera dentro de su alcance; miembro consulta las propias. |
| Auditoría | `GET /audit-events` | Sólo administración autorizada; filtros y datos sensibles restringidos. |

Usar respuestas de error consistentes (`400` entrada inválida, `401` sin sesión, `403` sin permiso, `404` recurso inexistente o no visible, `409` conflicto de estado/cupo). No incluir stack traces ni secretos en respuestas de producción.

## Secuencia de implementación

### B0 — Contratos y seguridad (documentado)
- Modelo de amenazas, roles, entidades, invariantes transaccionales y contratos API definidos.
- Proveedor de despliegue, dominio y política operativa de backups aún por seleccionar.
- La demo permanece separada y ejecutable.

### B1 — Backend mínimo y migraciones (fundación implementada; falta validar CI)
- Estructura TypeScript/Fastify, configuración de entorno y entrada de proceso.
- Migración PostgreSQL inicial con perfiles, usuarios, sesiones, membresías, movimientos, agenda, reservas, asistencia, obligaciones, rutinas y auditoría.
- Health check, autenticación por cookie de sesión de servidor y endpoints iniciales de miembros.
- Pruebas unitarias/API y workflow CI que instala PostgreSQL, aplica la migración, verifica tipos, ejecuta tests y compila.
- Pendiente: ejecución verde de CI, pruebas de integración contra PostgreSQL desde la API y revisión de seguridad independiente.

### B2 — Identidad y autorización (primera versión implementada)
- Login/logout, sesiones revocables, cookies seguras, CSRF, validación de origen y límite de intentos por proceso.
- Lecturas y escrituras iniciales de perfiles con autorización por rol y alcance.
- Pendiente: recuperación de contraseña, MFA si se justifica, almacenamiento distribuido de rate limits y revisión de seguridad independiente.

### B3 — Flujos operativos verticales (implementados parcialmente)
- Reservas y cancelaciones transaccionales con capacidad, corte de 40 minutos, prevención de duplicados y promoción de lista de espera.
- Cuenta corriente con movimientos idempotentes y auditoría.
- Asistencia histórica, catálogo de ejercicios, rutinas versionadas y asignaciones con permisos de alcance.
- Obligaciones mensuales fijas de profesores, pagos parciales y ajustes trazables.
- Pendiente: automatización de facturación de membresías, notificaciones y conexión progresiva de la PWA con la API.

### B4 — Integridad y cobertura de pruebas (en progreso)
- Ejecutar y mantener verde CI: tipos, pruebas unitarias, pruebas API y migraciones PostgreSQL.
- Ampliar pruebas negativas de permisos para cada endpoint y pruebas de fallos/reintentos.
- Verificar inmutabilidad de los movimientos y auditoría en escenarios de concurrencia.
- Añadir pruebas de integración para cada flujo financiero y de asistencia que no esté cubierto.

### B5 — Preproducción (pendiente)
- Restaurar un backup en entorno aislado y documentar RPO/RTO.
- Pruebas en navegadores Android reales y distintos tamaños.
- Pruebas de carga básica, doble reserva simultánea, expiración/revocación de sesión y permisos cruzados.
- Elegir hosting y secretos, configurar monitoreo, retención de logs y alertas.
- Aprobación explícita antes de cargar datos reales.

## Criterios de salida de seguridad

- [ ] Ninguna operación privada depende de controles visuales del frontend.
- [ ] Todas las rutas validan identidad, rol, alcance y esquema de entrada.
- [ ] Dos solicitudes simultáneas no pueden superar el cupo.
- [ ] Ningún miembro ni profesor puede consultar datos ajenos mediante IDs manipulados.
- [ ] Las operaciones financieras y las correcciones de asistencia quedan auditadas.
- [ ] Las cookies/sesiones, CSRF, CORS, rate limiting y secretos están revisados.
- [ ] Backup y restauración se han probado, no sólo configurado.
- [ ] CI ejecuta pruebas unitarias, integración y autorización antes de permitir el merge.
- [ ] Se documenta la política de retención y acceso para DNI, contacto de emergencia y demás datos personales.
- [ ] La aplicación muestra claramente que la demo local no es el sistema de producción.

## Riesgos abiertos

- Definir quién puede editar datos personales, ver deuda y registrar pagos dentro del rol de profesor.
- Confirmar reglas de vencimiento, suspensión y reactivación antes de automatizarlas.
- Confirmar zona horaria operativa y reglas de cambios de horario.
- Definir política de conservación de datos y consentimiento para notificaciones.
- Seleccionar proveedor concreto de hosting/autenticación/base de datos tras comparar costo, exportabilidad, backups y operación desde Argentina.

## Implementation status — 2026-10-08

The first backend foundation has been added under `server/`:
- Node.js 22+, TypeScript strict checks, Fastify, security headers and exact-origin CORS configuration.
- Health endpoints: `GET /healthz` and `GET /api/v1/health`.
- Local email/password login with scrypt hashes, opaque server-side sessions stored as SHA-256 token digests, seven-day expiry, revocation, HttpOnly/SameSite=Strict cookies, HMAC-derived CSRF tokens, Origin checks and in-memory per-IP rate limiting.
- A one-time environment-based administrator bootstrap command.
- Administrator-created, 24-hour single-use invitations for member/coach accounts; invite tokens are stored as SHA-256 digests and account activation requires the recipient to set a password.
- Read-only member endpoints: admin-only paginated list and profile reads scoped to administrators, the member themselves, or an assigned coach; responses minimize fields by role.
- Transactional booking and cancellation endpoints: session-row locking, server-side 40-minute cutoff, capacity checks, duplicate prevention, and waitlist promotion when a confirmed booking is cancelled before cutoff. PostgreSQL integration tests exercise concurrent bookings.
- Member account history with role-scoped reads and administrator-only charge/payment/adjustment/refund creation. Ledger amounts use exact decimal strings, debit/credit direction, transaction-scoped audit events and idempotency keys to prevent duplicate financial movements.
- Coach directory and fixed monthly obligations by period, append-only signed adjustments, partial/excess payments, idempotent payment/adjustment requests and role-scoped obligation reads. No percentage-share or booking-based coach revenue model is used.
- Local email/password login using scrypt password hashes, generic invalid-credential responses, and a one-time administrator bootstrap command.
- Opaque server-side sessions with SHA-256 token digests, seven-day expiry, revocation, HttpOnly/SameSite=Strict cookies, CSRF HMAC tokens, strict Origin checks on authentication mutations, and per-IP in-memory login rate limiting.
- Pure booking decision helpers for the 40-minute cutoff, capacity, duplicate active booking rejection and waitlist eligibility, with unit tests.
- Initial PostgreSQL schema covering the core product entities, including append-only triggers for member ledger entries, coach payments and audit events.
- Transactional, advisory-lock-protected SQL migration runner.
- CI typecheck/test/build plus a disposable PostgreSQL migration and repeat-run check.

This is an executable foundation, not the production system. Resource-level authorization exists for member profile reads/writes and the current booking, ledger, coach, attendance and routine endpoints; it still needs broader negative testing and independent review. Self-service password recovery, MFA if required, a shared rate-limit store for multiple replicas, backups and deployment are still pending. Admin-assisted access reset for member/coach accounts now revokes sessions and outstanding invitations before issuing a one-time password setup token. The current login/session implementation needs successful CI and PostgreSQL migration checks before it should be treated as a stable foundation. Booking rules are connected to transactional endpoints with PostgreSQL concurrency integration coverage. Before production use, the implementation still needs broader failure/retry tests, a completed audit review, tested backup restoration and operational monitoring.

## Implementation sequence updated

1. Complete this baseline with CI results and correct any migration/type/test failures.
2. Finish the authentication review, add password recovery and invitation resend/revocation, and decide the deployment-grade shared rate-limit store.
3. Expand role/scope authorization and negative tests for every new endpoint; member profile reads now have initial coverage.
4. Extend the transaction-capable repository and audited member-profile writes with integration tests for date constraints and conflict responses.
5. Extend booking tests for cancellation cutoff, transaction rollback, retries and operational edge cases.
6. Add PostgreSQL integration tests for ledger append-only behavior and role isolation before exposing production data.
