import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GENERATION_DAYS, assignmentCoversDate, datesForWeekday, isValidCalendarDate,
  isValidLocalTime, isValidWeekday, validateGenerationRange
} from "../src/domain/schedule.js";
import { loadConfig } from "../src/config.js";

test("calendar dates, local times and weekdays are validated strictly", () => {
  assert.equal(isValidCalendarDate("2031-02-28"), true);
  assert.equal(isValidCalendarDate("2031-02-30"), false);
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2031-2-3"), false);
  assert.equal(isValidLocalTime("00:00"), true);
  assert.equal(isValidLocalTime("23:59"), true);
  assert.equal(isValidLocalTime("24:00"), false);
  assert.equal(isValidLocalTime("7:30"), false);
  assert.equal(isValidWeekday(0), true);
  assert.equal(isValidWeekday(6), true);
  assert.equal(isValidWeekday(7), false);
  assert.equal(isValidWeekday(1.5), false);
});

test("generation range is inclusive and capped at 90 days", () => {
  assert.deepEqual(validateGenerationRange("2031-01-01", "2031-01-01"), { ok: true, days: 1 });
  assert.deepEqual(validateGenerationRange("2031-01-01", "2031-01-28"), { ok: true, days: 28 });
  assert.equal(MAX_GENERATION_DAYS, 90);
  assert.deepEqual(validateGenerationRange("2031-01-01", "2031-03-31"), { ok: true, days: 90 });
  assert.deepEqual(validateGenerationRange("2031-01-01", "2031-04-01"), { ok: false, reason: "range_too_large" });
  assert.deepEqual(validateGenerationRange("2031-01-10", "2031-01-01"), { ok: false, reason: "invalid_range" });
  assert.deepEqual(validateGenerationRange("2031-13-01", "2031-01-01"), { ok: false, reason: "invalid_date" });
});

test("weekday 0 is Sunday and dates are listed in order", () => {
  // 2031-01-01 es miercoles.
  assert.deepEqual(datesForWeekday("2031-01-01", "2031-01-28", 1), ["2031-01-06", "2031-01-13", "2031-01-20", "2031-01-27"]);
  assert.deepEqual(datesForWeekday("2031-01-01", "2031-01-14", 0), ["2031-01-05", "2031-01-12"]);
  assert.deepEqual(datesForWeekday("2031-01-01", "2031-01-01", 3), ["2031-01-01"]);
  assert.deepEqual(datesForWeekday("2031-01-01", "2031-01-01", 4), []);
  assert.deepEqual(datesForWeekday("2031-01-01", "2031-12-31", 1), []); // rango demasiado grande
});

test("a fixed slot covers its start and end dates and open-ended slots never expire", () => {
  assert.equal(assignmentCoversDate("2031-01-06", "2031-01-20", "2031-01-05"), false);
  assert.equal(assignmentCoversDate("2031-01-06", "2031-01-20", "2031-01-06"), true);
  assert.equal(assignmentCoversDate("2031-01-06", "2031-01-20", "2031-01-20"), true);
  assert.equal(assignmentCoversDate("2031-01-06", "2031-01-20", "2031-01-21"), false);
  assert.equal(assignmentCoversDate("2031-01-06", null, "2040-01-01"), true);
});

test("the gym time zone defaults to Buenos Aires and rejects invalid zones", () => {
  assert.equal(loadConfig({ NODE_ENV: "test" }).gymTimezone, "America/Argentina/Buenos_Aires");
  assert.equal(loadConfig({ NODE_ENV: "test", GYM_TIMEZONE: "America/Montevideo" }).gymTimezone, "America/Montevideo");
  assert.throws(() => loadConfig({ NODE_ENV: "test", GYM_TIMEZONE: "Mars/Olympus_Mons" }), /GYM_TIMEZONE/);
});
