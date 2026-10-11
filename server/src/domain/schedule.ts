// Agenda: reglas puras para plantillas de clase y generacion de instancias.
// Convencion de dia de la semana: 0 = domingo ... 6 = sabado (igual que Date#getDay y
// EXTRACT(dow) de PostgreSQL). Las fechas son "de calendario" (YYYY-MM-DD) en la zona
// horaria del gimnasio; la conversion a instante la hace PostgreSQL con AT TIME ZONE.

export const MAX_GENERATION_DAYS = 90;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidWeekday(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export type GenerationRangeError = "invalid_date" | "invalid_range" | "range_too_large";

/** Cantidad de dias del rango inclusivo, o el motivo por el que no es valido. */
export function validateGenerationRange(from: string, to: string): { ok: true; days: number } | { ok: false; reason: GenerationRangeError } {
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to)) return { ok: false, reason: "invalid_date" };
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1) return { ok: false, reason: "invalid_range" };
  if (days > MAX_GENERATION_DAYS) return { ok: false, reason: "range_too_large" };
  return { ok: true, days };
}

/** Fechas de calendario del rango inclusivo que caen en el dia de semana dado. */
export function datesForWeekday(from: string, to: string, weekday: number): string[] {
  const range = validateGenerationRange(from, to);
  if (!range.ok || !isValidWeekday(weekday)) return [];
  const dates: string[] = [];
  for (let offset = 0; offset < range.days; offset += 1) {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    if (weekdayOf(day) === weekday) dates.push(day);
  }
  return dates;
}

/** ¿Un turno fijo (starts_on..ends_on) alcanza a esta fecha de calendario? */
export function assignmentCoversDate(startsOn: string, endsOn: string | null, date: string): boolean {
  return date >= startsOn && (endsOn === null || date <= endsOn);
}
