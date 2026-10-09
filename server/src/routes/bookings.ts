import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import {
  canPromoteWaitlist,
  evaluateBookingRequest,
  isBeforeBookingCutoff
} from "../domain/booking.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface SessionParams {
  id: string;
}

interface BookingParams {
  id: string;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  starts_at: string | Date;
  status: string;
  capacity_snapshot: number;
  server_now: string | Date;
}

interface BookingRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  member_id: string;
  status: "confirmed" | "waitlist" | "cancelled";
  created_at?: string | Date;
}

class BookingRuleError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: string,
    message: string
  ) {
    super(message);
    this.name = "BookingRuleError";
  }
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function sendRuleError(reply: Parameters<Parameters<FastifyInstance["post"]>[1]>[1], error: BookingRuleError) {
  return reply.code(error.statusCode).send({
    error: error.errorCode,
    message: error.message
  });
}

function isRuleError(error: unknown): error is BookingRuleError {
  return error instanceof BookingRuleError;
}

export function registerBookingRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.post<{ Params: SessionParams }>(
    "/api/v1/class-sessions/:id/bookings",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!actor.roles.includes("member") || !actor.memberId) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only a member can book a class for their own account."
        });
      }
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      try {
        const booking = await transactionalDb.transaction(async (tx) => {
          const sessionResult = await tx.query<SessionRow>(
            `SELECT id, starts_at, status, capacity_snapshot, clock_timestamp() AS server_now
               FROM class_sessions
              WHERE id = $1
              FOR UPDATE`,
            [request.params.id]
          );
          const session = sessionResult.rows[0];
          if (!session) throw new BookingRuleError(404, "not_found", "The requested class session was not found.");
          if (session.status !== "scheduled") {
            throw new BookingRuleError(409, "session_not_bookable", "This class session is not open for booking.");
          }

          const memberResult = await tx.query<{ status: string } & Record<string, unknown>>(
            "SELECT status FROM member_profiles WHERE id = $1 FOR UPDATE",
            [actor.memberId]
          );
          if (memberResult.rows[0]?.status !== "active") {
            throw new BookingRuleError(403, "member_not_active", "Only active members can book a class.");
          }

          const existing = await tx.query<{ id: string } & Record<string, unknown>>(
            `SELECT id FROM bookings
              WHERE session_id = $1 AND member_id = $2
                AND status IN ('confirmed', 'waitlist')
              LIMIT 1`,
            [session.id, actor.memberId]
          );
          const count = await tx.query<{ total: number } & Record<string, unknown>>(
            "SELECT count(*)::int AS total FROM bookings WHERE session_id = $1 AND status = 'confirmed'",
            [session.id]
          );

          const startsAt = toIso(session.starts_at);
          const now = toIso(session.server_now);
          const decision = evaluateBookingRequest({
            startsAt,
            now,
            capacity: session.capacity_snapshot,
            confirmedBookings: count.rows[0]?.total ?? 0,
            hasActiveBooking: existing.rows.length > 0
          });
          if (!decision.allowed) {
            if (decision.reason === "duplicate_booking") {
              throw new BookingRuleError(409, "booking_already_exists", "You already have an active booking for this class.");
            }
            if (decision.reason === "cutoff_passed") {
              throw new BookingRuleError(409, "booking_cutoff_passed", "Bookings close 40 minutes before the class starts.");
            }
            throw new BookingRuleError(409, "booking_not_available", "This class cannot accept another booking.");
          }

          const status = decision.status === "confirmado" ? "confirmed" : "waitlist";
          const inserted = await tx.query<BookingRow>(
            `INSERT INTO bookings (session_id, member_id, status, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, session_id, member_id, status, created_at`,
            [session.id, actor.memberId, status, actor.userId]
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("Booking insert did not return a row.");
          return {
            id: row.id,
            sessionId: row.session_id,
            status: row.status,
            createdAt: row.created_at ? toIso(row.created_at) : null
          };
        });
        return reply.code(201).send({ booking });
      } catch (error) {
        if (isRuleError(error)) return sendRuleError(reply, error);
        throw error;
      }
    }
  );

  app.post<{ Params: BookingParams }>(
    "/api/v1/bookings/:id/cancel",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const initial = await tx.query<{ session_id: string } & Record<string, unknown>>(
            "SELECT session_id FROM bookings WHERE id = $1",
            [request.params.id]
          );
          const sessionId = initial.rows[0]?.session_id;
          if (!sessionId) throw new BookingRuleError(404, "not_found", "The requested booking was not found.");

          const sessionResult = await tx.query<SessionRow>(
            `SELECT id, starts_at, status, capacity_snapshot, clock_timestamp() AS server_now
               FROM class_sessions
              WHERE id = $1
              FOR UPDATE`,
            [sessionId]
          );
          const session = sessionResult.rows[0];
          if (!session) throw new BookingRuleError(404, "not_found", "The requested class session was not found.");

          const bookingResult = await tx.query<BookingRow>(
            `SELECT id, session_id, member_id, status
               FROM bookings
              WHERE id = $1
              FOR UPDATE`,
            [request.params.id]
          );
          const booking = bookingResult.rows[0];
          if (!booking) throw new BookingRuleError(404, "not_found", "The requested booking was not found.");

          const isOwner = actor.roles.includes("member") && actor.memberId === booking.member_id;
          if (!actor.roles.includes("admin") && !isOwner) {
            throw new BookingRuleError(404, "not_found", "The requested booking was not found.");
          }
          if (booking.status === "cancelled") {
            throw new BookingRuleError(409, "booking_already_cancelled", "This booking has already been cancelled.");
          }
          if (session.status !== "scheduled") {
            throw new BookingRuleError(409, "session_not_cancellable", "This class session can no longer be changed.");
          }

          const startsAt = toIso(session.starts_at);
          const now = toIso(session.server_now);
          if (!isBeforeBookingCutoff(startsAt, now, 40)) {
            throw new BookingRuleError(409, "cancellation_cutoff_passed", "Cancellations close 40 minutes before the class starts.");
          }

          await tx.query(
            "UPDATE bookings SET status = 'cancelled', cancelled_at = clock_timestamp() WHERE id = $1",
            [booking.id]
          );

          let promoted: { id: string; member_id: string } | null = null;
          if (booking.status === "confirmed") {
            const confirmed = await tx.query<{ total: number } & Record<string, unknown>>(
              "SELECT count(*)::int AS total FROM bookings WHERE session_id = $1 AND status = 'confirmed'",
              [session.id]
            );
            const waiting = await tx.query<{ total: number } & Record<string, unknown>>(
              "SELECT count(*)::int AS total FROM bookings WHERE session_id = $1 AND status = 'waitlist'",
              [session.id]
            );
            const confirmedCount = confirmed.rows[0]?.total ?? 0;
            const waitingCount = waiting.rows[0]?.total ?? 0;
            if (canPromoteWaitlist({
              startsAt,
              now,
              capacity: session.capacity_snapshot,
              confirmedBookings: confirmedCount,
              waitingCount
            })) {
              const next = await tx.query<{ id: string; member_id: string } & Record<string, unknown>>(
                `SELECT id, member_id FROM bookings
                  WHERE session_id = $1 AND status = 'waitlist'
                  ORDER BY created_at ASC, id ASC
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED`,
                [session.id]
              );
              const candidate = next.rows[0];
              if (candidate) {
                await tx.query(
                  "UPDATE bookings SET status = 'confirmed', promoted_at = clock_timestamp() WHERE id = $1",
                  [candidate.id]
                );
                promoted = { id: candidate.id, member_id: candidate.member_id };
              }
            }
          }

          return {
            id: booking.id,
            status: "cancelled" as const,
            promotedBooking: promoted ? { id: promoted.id, memberId: promoted.member_id } : null
          };
        });
        return reply.send({ booking: result });
      } catch (error) {
        if (isRuleError(error)) return sendRuleError(reply, error);
        throw error;
      }
    }
  );
}
