import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface SessionParams { id: string }
interface MemberParams { id: string }
interface AttendanceRecordInput { bookingId: string; attended: boolean; arrivedLate?: boolean }
interface AttendanceBody { records: AttendanceRecordInput[] }

interface SessionScopeRow extends Record<string, unknown> {
  id: string;
  status: string;
  coach_id: string;
}
interface BookingRow extends Record<string, unknown> {
  id: string;
  member_id: string;
  status: string;
}
interface AttendanceRow extends Record<string, unknown> {
  id: string;
  booking_id: string;
  attended: boolean;
  arrived_late: boolean;
  recorded_at: string | Date;
  updated_at: string | Date;
}

class AttendanceRuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "AttendanceRuleError";
  }
}

function mapError(reply: FastifyReply, error: unknown) {
  if (error instanceof AttendanceRuleError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  throw error;
}

async function sessionScope(db: Database, sessionId: string): Promise<SessionScopeRow | null> {
  const result = await db.query<SessionScopeRow>(
    `SELECT cs.id, cs.status, ct.coach_id
       FROM class_sessions cs
       JOIN class_templates ct ON ct.id = cs.template_id
      WHERE cs.id = $1
      LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

function canManageSession(actor: { roles: string[]; coachId: string | null }, session: SessionScopeRow): boolean {
  return actor.roles.includes("admin") ||
    (actor.roles.includes("coach") && actor.coachId === session.coach_id);
}

export function registerAttendanceRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get<{ Params: SessionParams }>(
    "/api/v1/class-sessions/:id/attendance",
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
      const session = await sessionScope(db, request.params.id);
      if (!session || !canManageSession(actor, session)) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      const records = await db.query(
        `SELECT b.id AS booking_id, b.member_id, m.full_name AS member_name,
                ar.attended, ar.arrived_late, ar.recorded_at, ar.updated_at,
                bn.kind AS notice_kind, bn.note AS notice_note
           FROM bookings b
           JOIN member_profiles m ON m.id = b.member_id
           LEFT JOIN attendance_records ar ON ar.booking_id = b.id
           LEFT JOIN booking_notices bn ON bn.booking_id = b.id
          WHERE b.session_id = $1 AND b.status = 'confirmed'
          ORDER BY lower(m.full_name), b.id`,
        [request.params.id]
      );
      return reply.send({ sessionId: request.params.id, records: records.rows });
    }
  );

  app.put<{ Params: SessionParams; Body: AttendanceBody }>(
    "/api/v1/class-sessions/:id/attendance",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          required: ["records"],
          additionalProperties: false,
          properties: {
            records: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: {
                type: "object",
                required: ["bookingId", "attended"],
                additionalProperties: false,
                properties: {
                  bookingId: { type: "string", format: "uuid" },
                  attended: { type: "boolean" },
                  arrivedLate: { type: "boolean" }
                }
              }
            }
          }
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

      const bookingIds = request.body.records.map((record) => record.bookingId);
      if (new Set(bookingIds).size !== bookingIds.length) return reply.code(400).send({
        error: "duplicate_booking_in_attendance",
        message: "Each booking may appear only once in an attendance update."
      });

      if (request.body.records.some((record) => record.arrivedLate === true && record.attended !== true)) {
        return reply.code(400).send({
          error: "late_requires_attendance",
          message: "Only a member who attended can be marked as having arrived late."
        });
      }

      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const sessionResult = await tx.query<SessionScopeRow>(
            `SELECT cs.id, cs.status, ct.coach_id
               FROM class_sessions cs
               JOIN class_templates ct ON ct.id = cs.template_id
              WHERE cs.id = $1
              FOR UPDATE OF cs`,
            [request.params.id]
          );
          const session = sessionResult.rows[0];
          if (!session || !canManageSession(actor, session)) {
            throw new AttendanceRuleError(404, "not_found", "The requested resource was not found.");
          }
          if (session.status === "cancelled") {
            throw new AttendanceRuleError(409, "session_cancelled", "Attendance cannot be recorded for a cancelled session.");
          }

          const bookings = await tx.query<BookingRow>(
            `SELECT id, member_id, status
               FROM bookings
              WHERE session_id = $1 AND id = ANY($2::uuid[]) AND status = 'confirmed'
              FOR UPDATE`,
            [request.params.id, bookingIds]
          );
          if (bookings.rows.length !== bookingIds.length) {
            throw new AttendanceRuleError(400, "invalid_attendance_booking", "Every booking must be confirmed and belong to this class session.");
          }

          const records: AttendanceRow[] = [];
          let created = 0;
          let updated = 0;
          let unchanged = 0;
          for (const requested of request.body.records) {
            const existingResult = await tx.query<AttendanceRow>(
              `SELECT id, booking_id, attended, arrived_late, recorded_at, updated_at
                 FROM attendance_records
                WHERE booking_id = $1
                FOR UPDATE`,
              [requested.bookingId]
            );
            const existing = existingResult.rows[0];
            if (!existing) {
              const inserted = await tx.query<AttendanceRow>(
                `INSERT INTO attendance_records (booking_id, attended, arrived_late, recorded_by)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, booking_id, attended, arrived_late, recorded_at, updated_at`,
                [requested.bookingId, requested.attended, requested.arrivedLate === true, actor.userId]
              );
              const row = inserted.rows[0];
              if (!row) throw new Error("Attendance insert did not return a row.");
              await tx.query(
                `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
                 VALUES ($1, 'attendance.recorded', 'attendance_record', $2, $3, $4::jsonb)`,
                [actor.userId, row.id, request.id, JSON.stringify({ bookingId: row.booking_id, attended: row.attended, arrivedLate: row.arrived_late })]
              );
              records.push(row);
              created += 1;
            } else if (
              existing.attended === requested.attended
              && (requested.arrivedLate === undefined || existing.arrived_late === requested.arrivedLate)
            ) {
              records.push(existing);
              unchanged += 1;
            } else {
              const update = await tx.query<AttendanceRow>(
                `UPDATE attendance_records
                    SET attended = $2, arrived_late = $3, recorded_by = $4, updated_at = clock_timestamp()
                  WHERE id = $1
                  RETURNING id, booking_id, attended, arrived_late, recorded_at, updated_at`,
                [
                  existing.id,
                  requested.attended,
                  // Sin `arrivedLate` se conserva lo anterior, salvo que ya no asistio (entonces no pudo llegar tarde).
                  requested.attended ? (requested.arrivedLate ?? existing.arrived_late) : false,
                  actor.userId
                ]
              );
              const row = update.rows[0];
              if (!row) throw new Error("Attendance update did not return a row.");
              await tx.query(
                `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data)
                 VALUES ($1, 'attendance.corrected', 'attendance_record', $2, $3, $4::jsonb, $5::jsonb)`,
                [
                  actor.userId,
                  row.id,
                  request.id,
                  JSON.stringify({ attended: existing.attended, arrivedLate: existing.arrived_late }),
                  JSON.stringify({ bookingId: row.booking_id, attended: row.attended, arrivedLate: row.arrived_late })
                ]
              );
              records.push(row);
              updated += 1;
            }
          }
          return { sessionId: request.params.id, created, updated, unchanged, records };
        });
        return reply.send(result);
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );

  app.get<{ Params: MemberParams }>(
    "/api/v1/members/:id/attendance",
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
      const memberId = request.params.id;
      const isOwner = actor.roles.includes("member") && actor.memberId === memberId;
      if (!actor.roles.includes("admin") && !isOwner) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      const member = await db.query<{ id: string } & Record<string, unknown>>(
        "SELECT id FROM member_profiles WHERE id = $1",
        [memberId]
      );
      if (!member.rows[0]) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      const history = await db.query(
        `SELECT ar.id, ar.attended, ar.arrived_late, ar.recorded_at, ar.updated_at,
                cs.id AS session_id, cs.starts_at, s.name AS service_name
           FROM attendance_records ar
           JOIN bookings b ON b.id = ar.booking_id
           JOIN class_sessions cs ON cs.id = b.session_id
           JOIN class_templates ct ON ct.id = cs.template_id
           JOIN services s ON s.id = ct.service_id
          WHERE b.member_id = $1
          ORDER BY cs.starts_at DESC, ar.id DESC`,
        [memberId]
      );
      return reply.send({ memberId, records: history.rows });
    }
  );
}
