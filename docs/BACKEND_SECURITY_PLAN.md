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

### B0 — Contratos y seguridad (este documento)
- Acordar modelo de amenazas, roles, entidades, reglas transaccionales y contratos API.
- Resolver proveedor de despliegue, base de datos, autenticación, dominio y política de backups.
- Mantener la demo actual ejecutable.

### B1 — Backend mínimo y migraciones
- Crear estructura TypeScript, configuración reproducible, validación de entorno y migraciones PostgreSQL.
- Implementar health check sin filtrar configuración.
- Añadir pruebas de migraciones desde base vacía y rollback/recuperación donde aplique.
- No exponer endpoints de datos hasta tener autenticación y autorización.

### B2 — Identidad y autorización
- Login, logout, recuperación, sesiones y rate limiting.
- Middleware de rol y funciones de alcance reutilizables.
- Pruebas negativas de IDOR/BOLA: un miembro y un profesor intentan acceder a recursos ajenos.
- Revisar CSRF, CORS, cookies, cabeceras, logs y secretos.

### B3 — Primer flujo vertical
- Implementar primero lectura/edición de miembros para administración, y lectura propia para miembro.
- Añadir agenda y reserva transaccional después de probar autorización.
- Mantener los flujos restantes en la demo hasta migrarlos individualmente; evitar una migración total de golpe.

### B4 — Finanzas, asistencia y rutinas
- Migrar movimientos contables sin alterar historia.
- Migrar asistencia sólo si hay registros verificables; no inferirla de contadores.
- Migrar obligaciones/pagos de profesores sin recuperar porcentajes antiguos como deudas.
- Incorporar auditoría y exportaciones autorizadas.

### B5 — Preproducción
- Restaurar un backup en entorno aislado.
- Pruebas en navegadores Android reales y distintos tamaños.
- Pruebas de carga básica, doble reserva simultánea, expiración de sesión, permisos cruzados y recuperación.
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
- Read-only member endpoints: admin-only paginated list and profile reads scoped to administrators, the member themselves, or an assigned coach; responses minimize fields by role.
- Local email/password login using scrypt password hashes, generic invalid-credential responses, and a one-time administrator bootstrap command.
- Opaque server-side sessions with SHA-256 token digests, seven-day expiry, revocation, HttpOnly/SameSite=Strict cookies, CSRF HMAC tokens, strict Origin checks on authentication mutations, and per-IP in-memory login rate limiting.
- Pure booking decision helpers for the 40-minute cutoff, capacity, duplicate active booking rejection and waitlist eligibility, with unit tests.
- Initial PostgreSQL schema covering the core product entities, including append-only triggers for member ledger entries, coach payments and audit events.
- Transactional, advisory-lock-protected SQL migration runner.
- CI typecheck/test/build plus a disposable PostgreSQL migration and repeat-run check.

This is an executable foundation, not the production system. Resource-level authorization exists only for read-only member profiles; write authorization and the remaining business resources are pending. Password recovery, a shared rate-limit store for multiple replicas, transactional booking repository, audit-writing integration, backups and deployment are still pending. The current login/session implementation needs successful CI and PostgreSQL migration checks before it should be treated as a stable foundation. The pure booking rules are not yet connected to database transactions; no production booking endpoint should be added before that integration is designed and tested.

## Implementation sequence updated

1. Complete this baseline with CI results and correct any migration/type/test failures.
2. Finish the authentication review, add password recovery and decide the deployment-grade shared rate-limit store.
3. Expand role/scope authorization and negative tests for every new endpoint; member profile reads now have initial coverage.
4. Add a transaction-capable repository and audited member-profile writes.
5. Implement booking transactions with row/advisory locking, capacity enforcement, cutoff enforcement and waitlist promotion.
6. Add PostgreSQL integration tests for concurrency, ledger append-only behavior and role isolation before exposing production data.
