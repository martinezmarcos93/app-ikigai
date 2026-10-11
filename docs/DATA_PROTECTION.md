# Protección de datos personales — Ikigai Training

Qué datos de personas guarda Ikigai, para qué, por cuánto tiempo, y cómo se ejercen los derechos de acceso,
rectificación y supresión. Está escrito para Argentina (Ley 25.326 de Protección de los Datos Personales y su decreto
reglamentario 1558/2001; autoridad de aplicación: AAIP). **Es una base técnica y operativa redactada por quien
desarrolló el sistema, no un dictamen jurídico: debe revisarla una persona con formación legal antes de cargar datos
reales** (ver «Pendiente»).

## Qué se guarda y para qué

| Dato | De quién | Para qué | Dónde |
| --- | --- | --- | --- |
| Nombre completo | Miembros, profesores | Identificar a la persona en la agenda, la asistencia y la cuenta | `member_profiles`, `coach_profiles` |
| Correo de acceso | Quien tiene cuenta | Iniciar sesión y recuperar la contraseña | `users` (la contraseña se guarda sólo como hash) |
| Teléfono y dirección | Miembros (opcional) | Contacto del gimnasio | `member_profiles` |
| DNI | Miembros (opcional) | Identificación administrativa si el gimnasio la necesita | `member_profiles` |
| Contacto de emergencia (nombre y teléfono) | Miembros (opcional) | Avisar ante una emergencia durante la clase | `member_profiles` |
| Notas internas | Miembros | Información operativa del gimnasio (por ejemplo, indicaciones de cuidado) | `member_profiles.notes` |
| Membresías, cargos, pagos y ajustes | Miembros | Llevar la cuenta corriente y la contabilidad | `memberships`, `ledger_entries` |
| Reservas, asistencia, avisos y llegadas tarde | Miembros | Gestionar la agenda y el historial | `bookings`, `attendance_records`, `booking_notices` |
| Rutinas asignadas | Miembros | Entrenamiento | `routine_assignments` |
| Obligación mensual y pagos | Profesores | Cuenta del espacio, fija y acordada | `coach_obligations`, `coach_payments` |
| Eventos de auditoría | Todos | Trazabilidad y seguridad: quién hizo qué y cuándo | `audit_events` |

**No se recogen** datos sensibles de salud como campo propio (el campo «notas internas» es libre: la guía es **no
escribir diagnósticos ni datos de salud** salvo que la persona lo pida y lo consienta), ni biometría, ni ubicación, ni
datos de tarjetas de pago. La auditoría registra *qué campos* cambiaron, no sus valores, y la exportación no se copia a
la auditoría. El portal no carga recursos de terceros (tipografías y scripts son propios) y no usa cookies de
seguimiento: sólo la cookie de sesión `HttpOnly`.

## Consentimiento e información

Al darse de alta, **antes de cargar sus datos**, se le informa a la persona (en papel o en pantalla) y debe dar su
consentimiento libre, expreso e informado. Texto sugerido, a validar legalmente:

> *Tus datos personales (nombre, contacto, DNI, contacto de emergencia y el historial de tus clases y pagos) serán
> tratados por **[razón social del gimnasio]**, con domicilio en **[domicilio]**, para gestionar tu membresía, tus
> reservas, tu asistencia y tu cuenta. No los cedemos a terceros salvo obligación legal. Los datos de contacto de
> emergencia son los de otra persona: confirmá que ella lo sabe. Podés acceder a tus datos, corregirlos o pedir que
> los suprimamos escribiendo a **[correo]**. Si no estás conforme con la respuesta, podés recurrir a la Agencia de
> Acceso a la Información Pública (AAIP), autoridad de control de la Ley 25.326.*

- **Menores de edad:** el alta y el consentimiento los da el padre, la madre o quien ejerza la responsabilidad parental,
  y el sistema no debe usarse para comunicar nada a un menor sin esa persona.
- **Contactos de emergencia:** son datos de terceros; el miembro es quien debe tener su conocimiento.
- Este consentimiento queda como constancia del gimnasio (el sistema no lo almacena hoy: ver «Pendiente»).

## Derechos y cómo se ejercen

| Derecho | Cómo se ejerce hoy | Plazo de respuesta |
| --- | --- | --- |
| **Acceso / portabilidad** | La propia persona entra a «Resumen» → **Descargar mis datos** y recibe un archivo JSON con todo lo que se guarda de ella. Administración puede hacerlo por cualquier miembro desde «Miembros» → **Exportar datos**. Cada exportación queda auditada. `GET /api/v1/members/:id/export` | 10 días corridos (art. 14, Ley 25.326) |
| **Rectificación** | Administración corrige el perfil en «Miembros» → *Ver / editar* (queda auditado por campos). La API también deja al miembro actualizar su teléfono, dirección y contacto de emergencia (`PATCH /api/v1/members/:id`); el portal todavía no tiene esa pantalla para el miembro | 5 días hábiles (art. 16) |
| **Supresión** | Administración anonimiza a quien dejó el gimnasio: **Miembros → Anonimizar** (exige estado «baja», sin reservas futuras ni membresías abiertas, un motivo escrito y la confirmación `ANONIMIZAR`). `POST /api/v1/members/:id/anonymize` | 5 días hábiles (art. 16) |
| **Oposición / baja del tratamiento** | Es lo mismo que pasar a «baja» y, si lo pide, anonimizar | 5 días hábiles |

### Qué hace exactamente la anonimización

Borra lo que **identifica** a la persona y conserva lo que la **contabilidad** y la **integridad** exigen:

| Se borra o se reemplaza | Se conserva (sin identidad) |
| --- | --- |
| Nombre (queda «Persona anonimizada»), correo, teléfono, dirección, DNI, contacto de emergencia y notas del perfil | Movimientos de cuenta (cargos, pagos, ajustes), con sus importes y fechas |
| El correo de la cuenta (queda `anonimizado-…@anonimizado.invalid`) y su contraseña (se inutiliza); la cuenta se deshabilita y se revocan sus sesiones, invitaciones y enlaces de recuperación | Membresías (servicio, vigencia y precio acordado) |
| Las notas libres de los avisos de reserva y de las rutinas asignadas | Reservas y asistencia (fechas, estado, llegadas tarde) |

Es **irreversible** y **no se puede ejecutar a medias**: es una única transacción. Después de anonimizar, el perfil no se
puede volver a editar, la persona no puede entrar y la exportación ya no contiene ningún dato personal. La operación es
idempotente (repetirla no hace nada) y queda auditada con su motivo y quién la ejecutó.

**Por qué no se borra todo:** los registros financieros deben conservarse para la contabilidad y las obligaciones
tributarias del gimnasio, y los movimientos de cuenta son **inmutables a propósito** (no se reescribe el historial). Esa
conservación es la excepción legal al borrado y por eso la persona queda sin identidad pero su movimiento contable sigue
existiendo. **Plazo de conservación a confirmar con el contador del gimnasio** (en Argentina, los libros y registros
contables suelen conservarse 10 años).

**Cuidado con el texto libre:** las *descripciones* de los movimientos de cuenta no se pueden borrar (son inmutables).
Por eso **no deben incluir datos personales** («Cuota de octubre», no «Cuota de Ana Pérez, DNI …»).

## Quién ve qué

| Rol | Ve |
| --- | --- |
| Miembro | Sólo lo suyo (perfil, membresías, cuenta, reservas, asistencia, rutinas y su exportación). Otra persona recibe `404` |
| Profesor | Los miembros con quienes tiene clases (asistencia y rutinas, dentro de su alcance); **no** puede exportar ni anonimizar |
| Administración | Todo, con auditoría de las operaciones que cambian o exponen datos personales |

La autorización se valida siempre en el servidor y está auditada de forma automática
([`SECURITY_ROUTE_MATRIX.md`](SECURITY_ROUTE_MATRIX.md)).

## Conservación y respaldos

- Datos activos: mientras la persona sea miembro y, después de la baja, el tiempo que exijan las obligaciones
  contables (ver arriba); luego, anonimización.
- **Los respaldos conservan los datos tal como estaban al respaldar**: una anonimización no reescribe respaldos
  anteriores. Por eso la retención de respaldos debe ser corta (14 días por defecto en `deploy/backup.sh`) y, si se
  restaura un respaldo, **hay que volver a aplicar las anonimizaciones hechas después** (el registro está en la
  auditoría: acción `member.anonymized`).
- Los respaldos se guardan cifrados y fuera del servidor (ver [`DEPLOYMENT.md`](DEPLOYMENT.md)).

## Encargados del tratamiento y transferencias

Hoy: el **servidor** donde se hospede (proveedor a elegir) y, cuando exista, el **adaptador de correo** de recuperación
de contraseña. Con cada uno hay que firmar un acuerdo de encargado de tratamiento y verificar **dónde están sus
servidores**: enviar datos a un país sin nivel de protección adecuado requiere las garantías del art. 12 de la Ley
25.326. No se usan servicios de analítica, publicidad ni notificaciones push de terceros.

## Incidentes

Si hay una brecha que exponga datos personales: contener, preservar evidencia, revocar accesos, rotar secretos y avisar
a las personas afectadas y a la AAIP (procedimiento en [`DEPLOYMENT.md`](DEPLOYMENT.md), «Respuesta a incidentes»).

## Pendiente (no resuelto por el sistema)

- [ ] **Revisión jurídica** de este documento y del texto de consentimiento.
- [ ] **Inscripción de la base de datos** ante el Registro Nacional de Bases de Datos de la AAIP, si corresponde al gimnasio.
- [ ] **Constancia del consentimiento:** hoy se guarda fuera del sistema (papel o archivo del gimnasio); si se quiere en el
      sistema, hace falta un campo de fecha y versión del texto aceptado.
- [ ] **Plazo de conservación contable** confirmado con el contador y registrado aquí.
- [ ] **Acuerdos con encargados** (hosting, correo) y verificación de la ubicación de sus servidores.
- [ ] **Política para datos de profesores y de administradores:** la anonimización implementada es la de miembros; los
      profesores tienen una obligación mensual y pagos que también son registros contables.
