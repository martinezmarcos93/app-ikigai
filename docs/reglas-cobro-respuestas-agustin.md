# Fechas de pago, tolerancia y recargo — respuestas de Agustín (09/11/2026)

Insumo para el diseño (ADR pendiente). No implementado todavía: se retoma después del deploy de las notificaciones push.

## Preguntas y respuestas (textuales)

| # | Pregunta | Respuesta de Agustín |
|---|---|---|
| 1 | ¿Vencimiento fijo para todos o según el inicio de cada miembro? | «¿Podemos hacerlo configurable por persona? Así yo desde la misma app lo marco.» |
| 2 | ¿La app genera sola el cargo del mes? | «Podríamos desde que termine el día de tolerancia.» |
| 3 | ¿Cuántos días de tolerancia? | «2 días.» |
| 4 | ¿Qué pasa al pasar la tolerancia? | «Un cargo fijo, pero a marcar el porcentaje de la deuda.» |
| 5 | ¿El recargo lo aplica la app o lo aprueba el admin? | «Que lo apruebe el admin.» |
| 6 | ¿Recordatorios? | «Mandamos recordatorio 1 día antes y misma fecha.» |

## Lectura propuesta (a confirmar con Agustín)

- **Vencimiento por persona:** día de vencimiento en cada membresía, editable por el admin desde la app.
- **Tolerancia:** 2 días después del vencimiento (¿configurable general o también por persona?).
- **Recargo:** porcentaje sobre la deuda impaga, que el admin fija (¿un % general del gimnasio o por persona?).
  «Cargo fijo» se interpreta como «se carga como un movimiento propio en la cuenta corriente», no como monto fijo. **Confirmar.**
- **Aprobación:** pasada la tolerancia, la app *propone* el recargo y el admin lo aprueba con un toque. Nunca automático.
- **Respuesta 2 es ambigua:** puede querer decir (a) el recargo se calcula recién cuando termina la tolerancia, o
  (b) la cuota del mes se genera sola. **Preguntar:** ¿la cuota mensual la sigue cargando a mano o la genera la app el día de vencimiento?
- **Recordatorios:** push privado al miembro 1 día antes del vencimiento y el día del vencimiento (usa la infraestructura push de `feat/avisos-push`;
  necesita un aviso *individual*, no general, y un disparador diario: el cron del Worker ya existe).
- **Cuidado de datos:** el recordatorio no debe mostrar el monto en la pantalla bloqueada sin confirmar que a Agustín le parece bien.
