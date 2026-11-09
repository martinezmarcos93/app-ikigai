# ADR-003 — Vencimientos, tolerancia, recargos y recordatorios de cuota

Estado: **aceptado** (09/11/2026; Marcos confirmó vencimiento general 10 + propio por persona, recargo % de la deuda y recordatorios con monto) · Insumo: `docs/reglas-cobro-respuestas-agustin.md`

## Contexto
Hoy la cuota se carga a mano como `charge` en la cuenta corriente; no hay fecha de vencimiento, ni mora, ni recargo.
`PRODUCT_PLAN.md` exige reglas explícitas y **ninguna multa automática no aprobada**. Los movimientos del libro son inmutables
(triggers): todo recargo entra como movimiento nuevo y se corrige con un `adjustment` a crédito, nunca editando.

Agustín pidió: vencimiento **configurable por persona**, **2 días** de tolerancia, recargo como **porcentaje de la deuda**
que **aprueba el admin**, y recordatorio **1 día antes y el mismo día**.

## Decisión

### 1. Día de vencimiento: general + propio por persona
- `billing_rules.default_due_day` (inicial **10**): el vencimiento de todos.
- `memberships.due_day smallint NULL CHECK (due_day BETWEEN 1 AND 28)`: el propio, para quien empezó a mitad de mes (p. ej. el 20).
  `NULL` = el general. **Al crear la membresía**, si la fecha de inicio es posterior al día general, `due_day` toma el día
  en que se anotó (29–31 → 28); si no, queda `NULL`. Agustín lo puede cambiar después en Membresías → «Vence». Se toma 1–28 para que exista en todos los meses. Si una persona tiene varias membresías mensuales,
  vence en el día más temprano y la cuota es la suma de los precios acordados.
- Solo aplica a membresías `monthly` y `active`. Otras periodicidades quedan fuera hasta que haga falta.

### 2. Reglas generales (`billing_rules`, una fila)
- `grace_days` (0–15, inicial **2**), `late_fee_percent` (0–100, dos decimales; `NULL` = no se proponen recargos),
  `late_fees_since` (se fija al activar el recargo: no hay recargos retroactivos), `due_reminders_enabled` (inicial `true`).
  Las edita administración en Configuración → «Cobros y vencimientos».

### 3. Mora y propuesta de recargo (nunca automático)
- Fecha de corte del período P = `due_day` del mes P + `grace_days`.
- Al pasar el corte, si la **deuda del miembro** (saldo deudor de su cuenta corriente a esa fecha) es > 0, se crea una
  **propuesta de recargo** en `late_fee_proposals` (miembro, membresía, período, deuda base, porcentaje, monto calculado,
  estado `pending|approved|dismissed`, quién decidió y cuándo). Una sola propuesta por miembro + período (único).
- El admin la ve en «Cuenta corriente → Recargos para aprobar»: **Aprobar** crea un `charge` «Recargo por mora <mes>»
  enlazado a la propuesta (idempotente); **Descartar** la cierra sin movimiento. Ambas quedan en auditoría.
- **Al aprobar se recalcula la deuda al corte** (puede haberse cargado después un pago con fecha anterior): si ya no hay
  deuda responde 409 y hay que descartar; si bajó, el recargo se calcula sobre la deuda menor (nunca sube).
  No se aprueban recargos de miembros egresados o anonimizados. Contra el doble cargo hay dos barreras: `FOR UPDATE` sobre la
  propuesta y el `UPDATE … WHERE status = 'pending'`; si falla la segunda, la transacción se deshace.
- Un recargo aprobado no se descarta: se corrige con un **ajuste a crédito** en la cuenta corriente.
- La mora **no cambia sola** el estado del miembro ni bloquea reservas (eso sigue siendo decisión del admin).

### 4. Recordatorios por push al miembro
- Día anterior y día del vencimiento, si `due_reminders_enabled` y la cuota no está cubierta: no hay pago con
  `applied_period` (o hecho) en ese mes, ni la cuota ya cargada desde el vencimiento anterior con saldo no deudor
  (pago anticipado a fin del mes previo), ni saldo a favor que la cubra. Con saldo a favor parcial, el aviso dice la diferencia. Texto **con monto**, decisión de Marcos/Agustín sabiendo que se ve en la pantalla
  bloqueada: «Tu cuota de $ 25.000 vence mañana.» (saldo deudor si lo hay; si no, la cuota acordada). Al tocarla abre Cuenta corriente.
- Reutiliza la infraestructura push de ADR/PR #45, ahora con destinatario individual. Se registra el envío
  (`due_reminders_sent`, único por membresía + período + tipo) para no duplicar.

### 5. Quién dispara la tarea diaria
- Endpoint interno `POST /api/v1/internal/daily` protegido con `INTERNAL_JOB_TOKEN` (cabecera, comparación en tiempo constante),
  fuera de la sesión y del CSRF; idempotente (se puede llamar varias veces por día sin efectos duplicados).
- Lo llama el **cron del Worker** una vez por día (nuevo cron `0 12 * * *` = 9:00 de Buenos Aires, todos los días,
  incluidos domingos). Render gratis duerme: el Worker ya maneja el arranque en frío.
- Fechas siempre en `GYM_TIMEZONE`.

## Abierto (preguntar a Agustín antes de implementar §6)
- **§6 Cuota mensual automática:** ¿la app genera sola el `charge` de la cuota el día de vencimiento (precio acordado de la
  membresía), o la sigue cargando él? Si es automática, entra como §6 con el mismo criterio de idempotencia por período.
  Sin respuesta, **no se genera** (comportamiento actual).
- **«Cargo fijo»:** se interpreta como «un movimiento propio en la cuenta corriente» calculado por porcentaje. Si quiso decir
  monto fijo, se agrega `late_fee_fixed` y la regla pasa a «fijo o porcentaje».

- **Base del recargo (hallazgo 6 de la revisión):** hoy el porcentaje se aplica sobre el **saldo deudor total** al corte, que
  incluye deuda de meses anteriores y recargos ya aprobados (recargo sobre recargo). Confirmar con Agustín **antes de cargar
  un porcentaje en producción**; la alternativa es calcularlo solo sobre la cuota del mes impaga.

## Consecuencias
- Migraciones: `due_day`, columnas en `institutional_settings`, `late_fee_proposals`, `due_reminders_sent`.
- Nuevas rutas admin (listar/aprobar/descartar propuestas) en la matriz de seguridad; ruta interna fuera de `PUBLIC_ROUTES` pero sin sesión.
- Secreto nuevo `INTERNAL_JOB_TOKEN` en Render y en el Worker.
- Tests: corte con tolerancia y zona horaria, fin de mes, idempotencia del job, propuesta única por período, aprobar crea un
  único `charge`, recordatorio no duplicado, miembro al día no recibe nada.
- Limitación conocida: mientras la cuota se cargue a mano, si no se cargó el cargo del mes el saldo es 0 y no hay propuesta de
  recargo (el recordatorio igual sale con la cuota acordada). Se resuelve con §6.
