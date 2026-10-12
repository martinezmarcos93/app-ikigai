import test from "node:test";
import assert from "node:assert/strict";
import {
  isBeforeBookingCutoff,
  isValidCapacity,
  evaluateBookingRequest,
  canPromoteWaitlist,
} from "../src/domain/booking.js";
import {
  isValidCalendarDate,
  isValidLocalTime,
  isValidWeekday,
  validateGenerationRange,
  datesForWeekday,
  assignmentCoversDate,
} from "../src/domain/schedule.js";
import {
  usernameCandidates,
  initials,
  generateTemporaryPassword,
} from "../src/domain/credentials.js";

test("T1: booking edge cases", () => {
  // isBeforeBookingCutoff
  assert.equal(isBeforeBookingCutoff("2026-10-10T18:00:00Z", "2026-10-10T17:19:59Z", 40), true);
  assert.equal(isBeforeBookingCutoff("2026-10-10T18:00:00Z", "2026-10-10T17:20:00Z", 40), false);
  assert.equal(isBeforeBookingCutoff("2026-10-10T18:00:00Z", "2026-10-10T17:20:01Z", 40), false);
  assert.equal(isBeforeBookingCutoff("2026-10-10T18:00:00Z", "2026-10-10T17:20:00Z", 0), true);

  // isValidCapacity
  assert.equal(isValidCapacity(1), true);
  assert.equal(isValidCapacity(30), true);
  assert.equal(isValidCapacity(0), false);
  assert.equal(isValidCapacity(31), false);
  assert.equal(isValidCapacity(1.5), false);

  // evaluateBookingRequest
  const base = {
    startsAt: "2026-10-10T18:00:00Z",
    now: "2026-10-10T10:00:00Z",
    capacity: 8,
    confirmedBookings: 3,
    hasActiveBooking: false,
  };
  assert.deepEqual(evaluateBookingRequest({ ...base, confirmedBookings: 0 }), { allowed: true, status: "confirmado" });
  assert.deepEqual(evaluateBookingRequest({ ...base, confirmedBookings: 8 }), { allowed: true, status: "espera" });
  assert.deepEqual(evaluateBookingRequest({ ...base, now: "2026-10-10T17:20:00Z" }), { allowed: false, reason: "cutoff_passed" });

  // canPromoteWaitlist
  assert.equal(canPromoteWaitlist({ ...base, confirmedBookings: 7, waitingCount: 1 }), true);
});

test("T2: schedule edge cases", () => {
  // isValidCalendarDate
  assert.equal(isValidCalendarDate("2026-13-01"), false);
  assert.equal(isValidCalendarDate("2026-02-30"), false);
  assert.equal(isValidCalendarDate("2026-02-28"), true);
  assert.equal(isValidCalendarDate("2000-02-29"), true); // Bisiesto
  assert.equal(isValidCalendarDate("2100-02-29"), false); // No bisiesto

  // isValidLocalTime
  assert.equal(isValidLocalTime("24:00"), false);
  assert.equal(isValidLocalTime("23:59"), true);
  assert.equal(isValidLocalTime("00:00"), true);

  // isValidWeekday
  assert.equal(isValidWeekday(0), true);
  assert.equal(isValidWeekday(6), true);
  assert.equal(isValidWeekday(7), false);

  // validateGenerationRange
  assert.deepEqual(validateGenerationRange("2026-01-01", "2026-01-01"), { ok: true, days: 1 });
  assert.deepEqual(validateGenerationRange("2026-01-01", "2026-04-01"), { ok: false, reason: "range_too_large" });
});

test("T3: credentials edge cases", () => {
  // initials
  assert.equal(initials("Marcos"), "MA");
  assert.equal(initials("M"), "MX");
  assert.equal(initials("Marcos Antonio Martinez"), "MM");
  assert.equal(initials("Ángel Ónix"), "AO");

  // generateTemporaryPassword
  const pwd = generateTemporaryPassword("Marcos Martinez");
  assert.match(pwd, /^MM-Ikigai-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});
