# Modelo de datos inicial — Ikigai Training

Este modelo separa el funcionamiento del gimnasio de la interfaz. Es la base conceptual para la futura API y base de datos compartida. La demo actual sólo implementa parte de estas entidades en localStorage y no debe considerarse multiusuario.

## Entidades

### Miembro
- Identificador interno, nombre, email, teléfono, domicilio, DNI opcional, fechas de alta y baja, contacto de emergencia, responsable/tutor cuando corresponda y notas operativas.
- Estado operativo: prueba, activo, suspendido, moroso o baja. La deuda no debe inferirse sólo del estado.
- Puede tener múltiples membresías a lo largo del tiempo.

### Servicio
- Nombre, disciplina, descripción, estado publicado/no publicado.
- Precio vigente como configuración actual, no como fuente para recalcular operaciones históricas.
- Reglas específicas si el servicio exige turnos, evaluación o asignación de profesor.

### Membresía
- Miembro, servicio, fecha de inicio, fecha de fin, periodicidad, precio acordado, estado y regla de vencimiento.
- Una modificación de precio genera una nueva condición o vigencia; no altera cargos ya emitidos.

### Movimiento de cuenta
- Miembro, fecha, tipo (cargo, pago, ajuste, devolución), importe, concepto, medio de pago, referencia, período imputado y usuario responsable.
- En la API definitiva se recomienda tipo + importe positivo, sin mezclarlo con importes firmados.
- Los pagos parciales se registran como movimientos independientes. El saldo se calcula a partir del historial, no se guarda como único dato editable.
- Los comprobantes internos no deben presentarse como factura fiscal. La integración fiscal es un alcance separado.

### Franja horaria
- Servicio/disciplina, profesor responsable, día, hora de inicio, duración, capacidad y estado.
- Capacidad configurable por franja; no hay límite global fijo.
- La agenda recurrente define disponibilidad semanal. La fecha concreta de una reserva genera una instancia operativa.

### Turno habitual
- Miembro, franja recurrente, fecha de inicio, fecha de fin opcional y estado.
- Permanece vigente hasta que se cambie manualmente o se suspenda. Una asignación habitual no debe confundirse con una reserva puntual.

### Reserva
- Miembro, instancia de clase (franja + fecha), estado (confirmada, espera, cancelada), fecha de creación, cancelación y promoción desde lista de espera.
- Restricción única por miembro e instancia: no permitir dos reservas activas de la misma persona para el mismo turno.
- Se aplica corte de 40 minutos antes del inicio para reservar/cancelar, según regla funcional acordada.
- Al liberar un cupo, promover automáticamente a la persona más antigua de la lista de espera, sin exceder capacidad.

### Asistencia
- Reserva/miembro, instancia de clase, estado presente/ausente, fecha y hora de registro, usuario responsable, última modificación.
- Debe ser histórica y corregible con trazabilidad; no depender de un contador manual aislado.
- `arrived_late`: marca informativa de que la persona asistió pero llegó tarde. Sólo puede ser verdadera si asistió (restricción `attendance_late_requires_presence`). Al corregir a «ausente» se limpia; si una corrección no la menciona, se conserva.

### Anonimización del miembro
- `member_profiles.anonymized_at`: cuándo se suprimieron los datos personales (sólo si `status = 'exited'`, restricción `member_anonymized_only_when_exited`). El nombre pasa a «Persona anonimizada» y se anulan correo, teléfono, dirección, DNI, contacto de emergencia y notas; la cuenta asociada se deshabilita con un correo `anonimizado-…@anonimizado.invalid` y una contraseña inutilizada. Se conservan movimientos de cuenta, membresías, reservas y asistencia. Ver `docs/DATA_PROTECTION.md`.

### Aviso de una reserva (`booking_notices`)
- Una reserva, tipo (`absence`: no asistirá; `late`: llegará tarde), nota opcional de hasta 200 caracteres, autor y fechas. A lo sumo un aviso por reserva (cambiarlo lo reemplaza).
- Lo crea el miembro dueño de la reserva (o administración) mientras la reserva no esté cancelada y la clase no haya empezado; el profesor de la clase y administración lo ven en la lista de asistencia.
- **Es informativo:** no cancela la reserva, no libera el cupo, no genera cargos, multas ni sanciones de ningún tipo (regla de producto). Para liberar el cupo hay que cancelar la reserva dentro del corte de 40 minutos. La auditoría registra el tipo y si hubo nota, pero no el texto de la nota.

### Profesor y obligación mensual
- Perfil, disciplinas, estado y datos de contacto.
- Obligación mensual acordada por uso del espacio, período al que corresponde, fecha de vencimiento y estado.
- Pagos del profesor al gimnasio: importe, fecha, período, medio, referencia y responsable de carga.
- El profesor cobra a sus propios alumnos por fuera de esta rendición. No calcular participaciones porcentuales sobre reservas ni asistencias.
- No cargar importes por defecto si no fueron acordados: el importe puede quedar sin configurar y debe señalarse explícitamente.

### Ejercicio, rutina y asignación
- Ejercicio: nombre, descripción, equipo, precauciones y estado.
- Rutina: nombre, disciplina, nivel, versión y autor.
- Detalle de rutina: ejercicio, orden, series, repeticiones/duración, descanso y notas.
- Asignación: miembro, rutina/version, responsable, fecha de inicio y fin, observaciones e historial.

### Usuario, rol y auditoría
- Usuario de acceso independiente de la ficha de miembro/profesor.
- Roles: administración, profesor y miembro; el alcance también limita a qué miembros, clases y datos puede acceder cada usuario.
- Evento de auditoría: actor, acción, entidad, identificador, fecha, valores relevantes anteriores/nuevos y motivo cuando corresponda.
- La autorización se valida en el servidor para cada lectura y escritura. Ocultar controles en la interfaz no constituye seguridad.

## Invariantes importantes

1. Una reserva confirmada nunca puede superar la capacidad de la instancia.
2. La suma de confirmadas más personas en espera puede superar la capacidad; sólo las confirmadas ocupan cupo.
3. Promover desde espera sólo ocurre si hay cupo y el turno aún no superó el corte operativo.
4. Un movimiento histórico nunca cambia automáticamente porque cambie el precio vigente.
5. Un pago mensual de profesor se imputa a un período concreto y puede ser parcial.
6. Si no hay obligación mensual configurada, el saldo se muestra como no calculable, no como cero.
7. Un usuario no puede leer ni modificar datos fuera de su alcance aunque invoque la API directamente.
8. Las acciones críticas deben ser idempotentes o protegerse contra doble envío.

## Migración desde la demo

La demo guarda arrays en localStorage, mezcla estado derivado con datos editables y contiene datos ficticios. La futura migración debe:
- Crear un esquema de base de datos normalizado.
- Convertir saldos de miembro en movimientos verificables antes de importarlos.
- No migrar las tasas y porcentajes antiguos de profesores como obligaciones reales.
- Importar asistencia sólo si existe un registro verificable; no inferirla desde el contador de asistencias.
- Mantener la demo aislada y realizar una importación de prueba antes de cualquier migración real.
