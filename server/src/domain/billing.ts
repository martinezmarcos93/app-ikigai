// ADR-003: vencimientos, tolerancia, propuestas de recargo y recordatorios de cuota.
// Todas las fechas son "YYYY-MM-DD" en la zona horaria del gimnasio. Los montos se calculan en centavos (enteros).
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../db.js";
import type { PushSender } from "./web-push.js";
import { notifyUser } from "../routes/push.js";

export interface BillingRules extends Record<string, unknown> {
  default_due_day: number;
  grace_days: number;
  late_fee_percent: string | null;
  late_fees_since: string | null;
  due_reminders_enabled: boolean;
}

// ---- Fechas (UTC puro sobre fechas calendario: sin horas, sin corrimientos) ----
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function addMonths(period: string, months: number): string {
  const date = toDate(period);
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** Primer dia del mes de una fecha. */
export function periodOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Vencimiento de un periodo (mes) con un dia 1-28: siempre existe en todos los meses. */
export function dueDateFor(period: string, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error("dueDay must be between 1 and 28.");
  return `${period.slice(0, 7)}-${String(dueDay).padStart(2, "0")}`;
}

/** Hoy en la zona horaria del gimnasio. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// ---- Dinero ----
export function toCents(amount: string | number): number {
  const [whole = "0", fraction = ""] = String(amount).replace(/^-/, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  return String(amount).startsWith("-") ? -cents : cents;
}
export const fromCents = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

/** Recargo = porcentaje de la deuda, redondeado al centavo (mitad hacia arriba). */
export function lateFeeCents(debtCents: number, percent: string): number {
  const basisPoints = toCents(percent); // 10.50% -> 1050
  return Math.floor((debtCents * basisPoints + 5_000) / 10_000);
}

export function formatPesos(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

// ---- Tarea diaria ----
interface MemberDue extends Record<string, unknown> {
  member_id: string;
  user_id: string | null;
  due_day: number;
  agreed_total: string;
  starts_on: string;
}

export interface DailySummary { today: string; members: number; reminders: number; proposals: number }

/** Saldo deudor (debitos - creditos) en centavos, contando movimientos hasta una fecha inclusive. */
async function balanceCents(db: Database, memberId: string, until: string): Promise<number> {
  const result = await db.query<{ balance: string } & Record<string, unknown>>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0)::numeric(14,2)::text AS balance
       FROM ledger_entries WHERE member_id = $1 AND occurred_on <= $2::date`,
    [memberId, until]
  );
  return toCents(result.rows[0]?.balance ?? "0");
}

/** ¿Pago algo este periodo? Pago imputado al mes o hecho entre el inicio del mes y hoy. */
async function paidThisPeriod(db: Database, memberId: string, period: string, today: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM ledger_entries
      WHERE member_id = $1 AND entry_type = 'payment'
        AND ((applied_period >= $2::date AND applied_period < $3::date) OR (occurred_on >= $2::date AND occurred_on <= $4::date))
      LIMIT 1`,
    [memberId, period, addMonths(period, 1), today]
  );
  return result.rows.length > 0;
}

/**
 * Corre una vez por dia (idempotente: se puede repetir sin duplicar nada).
 * - Recordatorio push al miembro el dia anterior y el dia del vencimiento, salvo que ya haya pagado ese mes.
 * - Pasada la tolerancia, si hay deuda, crea una PROPUESTA de recargo. Nunca crea movimientos: eso lo hace administracion al aprobar.
 */
export async function runDailyBilling(
  db: Database, sender: PushSender | undefined, log: FastifyBaseLogger, today: string
): Promise<DailySummary> {
  const rulesResult = await db.query<BillingRules>(
    "SELECT default_due_day, grace_days, late_fee_percent::text AS late_fee_percent, late_fees_since::text AS late_fees_since, due_reminders_enabled FROM billing_rules WHERE id = 1"
  );
  const rules = rulesResult.rows[0];
  if (!rules) throw new Error("billing_rules is not initialized.");

  // Un vencimiento por persona: el dia mas temprano entre sus membresias mensuales activas; la cuota es la suma de sus precios.
  const members = await db.query<MemberDue>(
    `SELECT mp.id AS member_id, mp.user_id, MIN(COALESCE(m.due_day, $1))::int AS due_day,
            SUM(m.agreed_price)::numeric(14,2)::text AS agreed_total, MIN(m.starts_on)::text AS starts_on
       FROM memberships m JOIN member_profiles mp ON mp.id = m.member_id
      WHERE m.billing_period = 'monthly' AND m.status = 'active'
        AND m.starts_on <= $2::date AND (m.ends_on IS NULL OR m.ends_on >= $2::date)
        AND mp.anonymized_at IS NULL AND mp.status <> 'exited'
      GROUP BY mp.id, mp.user_id`,
    [rules.default_due_day, today]
  );

  let reminders = 0;
  let proposals = 0;
  const current = periodOf(today);
  for (const member of members.rows) {
    // El mes anterior tambien: un vencimiento 28 + tolerancia cae en el mes siguiente, y cubre dias en que la tarea no corrio.
    for (const period of [addMonths(current, -1), current, addMonths(current, 1)]) {
      const dueOn = dueDateFor(period, member.due_day);
      if (dueOn < member.starts_on) continue; // todavia no le tocaba pagar ese mes

      if (rules.due_reminders_enabled && member.user_id) {
        const kind = today === addDays(dueOn, -1) ? "day_before" : today === dueOn ? "due_day" : null;
        if (kind && !(await paidThisPeriod(db, member.member_id, period, today))) {
          const balance = await balanceCents(db, member.member_id, today);
          const agreed = toCents(member.agreed_total);
          if (!(balance < 0 && -balance >= agreed)) {
            const inserted = await db.query(
              "INSERT INTO due_reminders_sent (member_id, period, kind) VALUES ($1, $2::date, $3) ON CONFLICT DO NOTHING RETURNING member_id",
              [member.member_id, period, kind]
            );
            if (inserted.rows.length) {
              const amount = formatPesos(balance > 0 ? balance : agreed);
              const when = kind === "day_before" ? "vence mañana" : "vence hoy";
              await notifyUser(db, sender, log, member.user_id, {
                kind: "due_reminder", title: "Ikigai Training", body: `Tu cuota de ${amount} ${when}.`, url: "/portal.html#accounts"
              });
              reminders += 1;
            }
          }
        }
      }

      if (rules.late_fee_percent && rules.late_fees_since) {
        const cutoffOn = addDays(dueOn, rules.grace_days);
        if (today > cutoffOn && cutoffOn >= rules.late_fees_since) {
          const debt = await balanceCents(db, member.member_id, cutoffOn);
          const fee = debt > 0 ? lateFeeCents(debt, rules.late_fee_percent) : 0;
          if (fee > 0) {
            const inserted = await db.query(
              `INSERT INTO late_fee_proposals (member_id, period, due_on, cutoff_on, debt_amount, percent, fee_amount)
               VALUES ($1, $2::date, $3::date, $4::date, $5, $6, $7) ON CONFLICT (member_id, period) DO NOTHING RETURNING id`,
              [member.member_id, period, dueOn, cutoffOn, fromCents(debt), rules.late_fee_percent, fromCents(fee)]
            );
            proposals += inserted.rows.length;
          }
        }
      }
    }
  }
  log.info({ today, members: members.rows.length, reminders, proposals }, "cobros: tarea diaria");
  return { today, members: members.rows.length, reminders, proposals };
}
