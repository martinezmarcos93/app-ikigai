import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, dueDateFor, formatPesos, fromCents, lateFeeCents, monthLabel, periodOf, toCents, todayIn } from "../src/domain/billing.js";

test("cobros: fechas de vencimiento y tolerancia cruzando meses y años", () => {
  assert.equal(dueDateFor("2026-03-01", 10), "2026-03-10");
  assert.equal(dueDateFor("2026-02-01", 28), "2026-02-28");
  assert.throws(() => dueDateFor("2026-02-01", 29));
  assert.throws(() => dueDateFor("2026-02-01", 0));
  assert.equal(addDays("2026-02-28", 2), "2026-03-02");
  assert.equal(addDays("2028-02-28", 2), "2028-03-01", "año bisiesto");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
  assert.equal(periodOf("2026-03-19"), "2026-03-01");
  assert.equal(monthLabel("2026-03-01"), "marzo 2026");
});

test("cobros: el dia del gimnasio sale de su zona horaria, no de UTC", () => {
  // 02:30 UTC del 10/03 = 23:30 del 09/03 en Buenos Aires.
  assert.equal(todayIn("America/Argentina/Buenos_Aires", new Date("2026-03-10T02:30:00Z")), "2026-03-09");
  assert.equal(todayIn("America/Argentina/Buenos_Aires", new Date("2026-03-10T03:30:00Z")), "2026-03-10");
});

test("cobros: recargo como porcentaje de la deuda, al centavo", () => {
  assert.equal(toCents("25000"), 2_500_000);
  assert.equal(toCents("25000.5"), 2_500_050);
  assert.equal(toCents("-10.05"), -1005);
  assert.equal(fromCents(2_500_050), "25000.50");
  assert.equal(fromCents(-1005), "-10.05");
  assert.equal(lateFeeCents(toCents("25000"), "10"), toCents("2500"));
  assert.equal(lateFeeCents(toCents("33333.33"), "10"), toCents("3333.33"));
  assert.equal(lateFeeCents(toCents("0.05"), "10"), 1, "medio centavo redondea hacia arriba");
  assert.equal(lateFeeCents(toCents("1000"), "12.5"), toCents("125"));
  assert.equal(lateFeeCents(toCents("1000"), "100"), toCents("1000"));
});

test("cobros: montos en pesos para la notificacion", () => {
  assert.match(formatPesos(toCents("25000")), /^\$\s?25\.000$/);
  assert.match(formatPesos(toCents("1234.5")), /^\$\s?1\.234,50$/);
});
