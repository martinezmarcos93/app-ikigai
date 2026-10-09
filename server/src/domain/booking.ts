export type BookingDecision = "confirmado" | "espera";

export interface BookingRequest {
  startsAt: string;
  now: string;
  capacity: number;
  confirmedBookings: number;
  hasActiveBooking: boolean;
  cutoffMinutes?: number;
}

export type BookingRejection =
  | "invalid_timestamp"
  | "invalid_capacity"
  | "invalid_booking_count"
  | "duplicate_booking"
  | "cutoff_passed";

export type BookingEvaluation =
  | { allowed: true; status: BookingDecision }
  | { allowed: false; reason: BookingRejection };

export function isBeforeBookingCutoff(
  startsAt: string,
  now: string,
  cutoffMinutes = 40
): boolean {
  const startsAtMs = Date.parse(startsAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) return false;
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes > 24 * 60) return false;
  return nowMs < startsAtMs - cutoffMinutes * 60_000;
}

export function isValidCapacity(capacity: number): boolean {
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= 30;
}

export function evaluateBookingRequest(input: BookingRequest): BookingEvaluation {
  const startsAtMs = Date.parse(input.startsAt);
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) {
    return { allowed: false, reason: "invalid_timestamp" };
  }
  if (!isValidCapacity(input.capacity)) {
    return { allowed: false, reason: "invalid_capacity" };
  }
  if (
    !Number.isInteger(input.confirmedBookings) ||
    input.confirmedBookings < 0 ||
    input.confirmedBookings > input.capacity
  ) {
    return { allowed: false, reason: "invalid_booking_count" };
  }
  if (input.hasActiveBooking) {
    return { allowed: false, reason: "duplicate_booking" };
  }

  const cutoffMinutes = input.cutoffMinutes ?? 40;
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes > 24 * 60) {
    return { allowed: false, reason: "invalid_timestamp" };
  }
  if (nowMs >= startsAtMs - cutoffMinutes * 60_000) {
    return { allowed: false, reason: "cutoff_passed" };
  }

  return {
    allowed: true,
    status: input.confirmedBookings < input.capacity ? "confirmado" : "espera"
  };
}

export interface WaitlistPromotionRequest {
  startsAt: string;
  now: string;
  capacity: number;
  confirmedBookings: number;
  waitingCount: number;
  cutoffMinutes?: number;
}

export function canPromoteWaitlist(input: WaitlistPromotionRequest): boolean {
  const startsAtMs = Date.parse(input.startsAt);
  const nowMs = Date.parse(input.now);
  const cutoffMinutes = input.cutoffMinutes ?? 40;
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) return false;
  if (!isValidCapacity(input.capacity)) return false;
  if (!Number.isInteger(input.confirmedBookings) || input.confirmedBookings < 0) return false;
  if (!Number.isInteger(input.waitingCount) || input.waitingCount < 1) return false;
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes > 24 * 60) return false;
  if (input.confirmedBookings >= input.capacity) return false;
  return nowMs < startsAtMs - cutoffMinutes * 60_000;
}
