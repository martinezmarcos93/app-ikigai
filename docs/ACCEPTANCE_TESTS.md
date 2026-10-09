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
