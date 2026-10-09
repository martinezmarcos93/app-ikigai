import test from "node:test";
import assert from "node:assert/strict";
import {
  canPromoteWaitlist,
  evaluateBookingRequest,
  isBeforeBookingCutoff,
  isValidCapacity
} from "../src/domain/booking.js";

const base = {
  startsAt: "2026-10-10T18:00:00-03:00",
  now: "2026-10-10T16:00:00-03:00",
  capacity: 8,
  confirmedBookings: 3,
  hasActiveBooking: false
};

test("cancellation cutoff is enforced against server timestamps", () => {
  assert.equal(isBeforeBookingCutoff(
    "2026-10-10T18:00:00-03:00",
    "2026-10-10T17:19:59-03:00"
  ), true);
  assert.equal(isBeforeBookingCutoff(
    "2026-10-10T18:00:00-03:00",
    "2026-10-10T17:20:00-03:00"
  ), false);
  assert.equal(isBeforeBookingCutoff("invalid", "2026-10-10T17:00:00-03:00"), false);
});

test("capacity accepts only integer values from 1 to 30", () => {
  for (const value of [1, 8, 30]) assert.equal(isValidCapacity(value), true);
  for (const value of [0, -1, 31, 1.5, Number.NaN]) assert.equal(isValidCapacity(value), false);
});

test("a valid request is confirmed when there is room", () => {
  assert.deepEqual(evaluateBookingRequest(base), { allowed: true, status: "confirmado" });
});

test("a full session puts a valid request on the waitlist", () => {
  assert.deepEqual(
    evaluateBookingRequest({ ...base, capacity: 8, confirmedBookings: 8 }),
    { allowed: true, status: "espera" }
  );
});

test("the server-side booking cutoff rejects a request exactly 40 minutes before start", () => {
  assert.deepEqual(
    evaluateBookingRequest({ ...base, now: "2026-10-10T17:20:00-03:00" }),
    { allowed: false, reason: "cutoff_passed" }
  );
});

test("a past session is rejected", () => {
  assert.deepEqual(
    evaluateBookingRequest({ ...base, now: "2026-10-10T18:00:01-03:00" }),
    { allowed: false, reason: "cutoff_passed" }
  );
});

test("duplicate active bookings are rejected", () => {
  assert.deepEqual(
    evaluateBookingRequest({ ...base, hasActiveBooking: true }),
    { allowed: false, reason: "duplicate_booking" }
  );
});

test("invalid timestamps, capacity and booking counts fail closed", () => {
  assert.deepEqual(evaluateBookingRequest({ ...base, startsAt: "not-a-date" }), {
    allowed: false, reason: "invalid_timestamp"
  });
  assert.deepEqual(evaluateBookingRequest({ ...base, capacity: 0 }), {
    allowed: false, reason: "invalid_capacity"
  });
  assert.deepEqual(evaluateBookingRequest({ ...base, confirmedBookings: 9 }), {
    allowed: false, reason: "invalid_booking_count"
  });
});

test("waitlist promotion requires an open seat and a person waiting before cutoff", () => {
  assert.equal(canPromoteWaitlist({
    startsAt: base.startsAt, now: base.now, capacity: 8,
    confirmedBookings: 7, waitingCount: 1
  }), true);
  assert.equal(canPromoteWaitlist({
    startsAt: base.startsAt, now: base.now, capacity: 8,
    confirmedBookings: 8, waitingCount: 1
  }), false);
  assert.equal(canPromoteWaitlist({
    startsAt: base.startsAt, now: "2026-10-10T17:20:00-03:00", capacity: 8,
    confirmedBookings: 7, waitingCount: 1
  }), false);
  assert.equal(canPromoteWaitlist({
    startsAt: base.startsAt, now: base.now, capacity: 8,
    confirmedBookings: 7, waitingCount: 0
  }), false);
});
