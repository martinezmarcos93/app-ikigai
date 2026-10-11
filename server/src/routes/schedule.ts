import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { assignmentCoversDate, isValidCalendarDate, validateGenerationRange } from "../domain/schedule.js";
import { resolveActor, type AuthenticatedActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

// Agenda: plantillas de clase semanales, generacion idempotente de instancias y turnos
// fijos (recurring_assignments). Toda escritura es de administracion, con CSRF, en una
// transaccion y con auditoria. Cambiar una plantilla NO reescribe instancias ya
// generadas (cada una guarda su capacidad); solo afecta a las que se generen despues.

const TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
const DATE_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

interface TemplateRow extends Record<string, unknown> {
  id: string;
  service_id: string;
  service_name: string;
  coach_id: string;
  coach_name: string;
  weekday: number;
  local_start_time: string;
  duration_minutes: number;
  capacity: number;
  active: boolean;
}

interface AssignmentRow extends Record<string, unknown> {
  id: string;
  member_id: string;
  template_id: string;
  starts_on: string | Date;
  ends_on: string | Date | null;
  active: boolean;
}

function templateJson(row: TemplateRow) {
  return {
    id: row.id,
    service: { id: row.service_id, name: row.service_name },
    coach: { id: row.coach_id, name: row.coach_name },
    weekday: row.weekday,
    localStartTime: String(row.local_start_time).slice(0, 5),
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    active: row.active
  };
}

function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function assignmentJson(row: AssignmentRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    templateId: row.template_id,
    startsOn: dateOnly(row.starts_on),
    endsOn: dateOnly(row.ends_on),
    active: row.active
  };
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

class RuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "ScheduleRuleError";
  }
}

function sendRule(reply: FastifyReply, error: RuleError) {
  return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
}

const TEMPLATE_SELECT = `SELECT ct.id, ct.service_id, s.name AS service_name, ct.coach_id, cp.full_name AS coach_name,
         ct.weekday, to_char(ct.local_start_time, 'HH24:MI') AS local_start_time,
         ct.duration_minutes, ct.capacity, ct.active
    FROM class_templates ct
    JOIN services s ON s.id = ct.service_id
    JOIN coach_profiles cp ON cp.id = ct.coach_id`;

export function registerScheduleRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  async function adminActor(
    request: Parameters<typeof resolveActor>[0],
    reply: FastifyReply,
    write: boolean
  ): Promise<AuthenticatedActor | null> {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) {
      reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
      return null;
    }
    if (!actor.roles.includes("admin")) {
      reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
      return null;
    }
    if (write && !requireCsrf(request, reply, actor.sessionToken, config)) return null;
    return actor;
  }

  // --- Plantillas -----------------------------------------------------

  app.get<{ Querystring: { active?: boolean } }>(
    "/api/v1/class-templates",
    { schema: { querystring: { type: "object", additionalProperties: false, properties: { active: { type: "boolean" } } } } },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
      const isAdmin = actor.roles.includes("admin");
      const ownCoach = actor.roles.includes("coach") ? actor.coachId : null;
      if (!isAdmin && !ownCoach) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission or a linked coach profile is required."
      });
      const result = await db.query<TemplateRow>(
        `${TEMPLATE_SELECT}
          WHERE ($1::uuid IS NULL OR ct.coach_id = $1)
            AND ($2::boolean IS NULL OR ct.active = $2)
          ORDER BY ct.weekday, ct.local_start_time, cp.full_name`,
        [isAdmin ? null : ownCoach, request.query.active ?? null]
      );
      return { templates: result.rows.map(templateJson) };
    }
  );

  app.post<{ Body: { service_id: string; coach_id: string; weekday: number; local_start_time: string; duration_minutes: number; capacity: number } }>(
    "/api/v1/class-templates",
    {
      schema: {
        body: {
          type: "object",
          required: ["service_id", "coach_id", "weekday", "local_start_time", "duration_minutes", "capacity"],
          additionalProperties: false,
          properties: {
            service_id: { type: "string", format: "uuid" },
            coach_id: { type: "string", format: "uuid" },
            weekday: { type: "integer", minimum: 0, maximum: 6 },
            local_start_time: { type: "string", pattern: TIME_PATTERN },
            duration_minutes: { type: "integer", minimum: 1, maximum: 480 },
            capacity: { type: "integer", minimum: 1, maximum: 30 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      const body = request.body;
      try {
        const template = await transactionalDb.transaction(async (tx) => {
          const service = await tx.query("SELECT 1 FROM services WHERE id = $1 AND active", [body.service_id]);
          if (!service.rowCount) throw new RuleError(422, "service_not_available", "The service does not exist or is inactive.");
          const coach = await tx.query("SELECT 1 FROM coach_profiles WHERE id = $1 AND active", [body.coach_id]);
          if (!coach.rowCount) throw new RuleError(422, "coach_not_available", "The coach does not exist or is inactive.");
          const inserted = await tx.query<{ id: string } & Record<string, unknown>>(
            `INSERT INTO class_templates (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity)
             VALUES ($1, $2, $3, $4::time, $5, $6) RETURNING id`,
            [body.service_id, body.coach_id, body.weekday, body.local_start_time, body.duration_minutes, body.capacity]
          );
          const id = inserted.rows[0]?.id;
          if (!id) throw new Error("Template insert did not return an id.");
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
             VALUES ($1, 'class_template.created', 'class_template', $2, $3, $4::jsonb)`,
            [actor.userId, id, request.id, JSON.stringify({
              weekday: body.weekday, localStartTime: body.local_start_time,
              durationMinutes: body.duration_minutes, capacity: body.capacity
            })]
          );
          const row = await tx.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE ct.id = $1`, [id]);
          return row.rows[0]!;
        });
        return reply.code(201).send({ template: templateJson(template) });
      } catch (error) {
        if (error instanceof RuleError) return sendRule(reply, error);
        if (pgCode(error) === "23505") return reply.code(409).send({
          error: "template_slot_taken",
          message: "That coach already has an active class at that weekday and time."
        });
        throw error;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: { active?: boolean; capacity?: number; duration_minutes?: number; coach_id?: string } }>(
    "/api/v1/class-templates/:id",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            active: { type: "boolean" },
            capacity: { type: "integer", minimum: 1, maximum: 30 },
            duration_minutes: { type: "integer", minimum: 1, maximum: 480 },
            coach_id: { type: "string", format: "uuid" }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      const body = request.body;
      try {
        const template = await transactionalDb.transaction(async (tx) => {
          const before = await tx.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE ct.id = $1 FOR UPDATE OF ct`, [request.params.id]);
          if (!before.rowCount) throw new RuleError(404, "template_not_found", "The class template was not found.");
          if (body.coach_id) {
            const coach = await tx.query("SELECT 1 FROM coach_profiles WHERE id = $1 AND active", [body.coach_id]);
            if (!coach.rowCount) throw new RuleError(422, "coach_not_available", "The coach does not exist or is inactive.");
          }
          await tx.query(
            `UPDATE class_templates SET
               active = COALESCE($2::boolean, active),
               capacity = COALESCE($3::smallint, capacity),
               duration_minutes = COALESCE($4::smallint, duration_minutes),
               coach_id = COALESCE($5::uuid, coach_id),
               updated_at = now()
             WHERE id = $1`,
            [request.params.id, body.active ?? null, body.capacity ?? null, body.duration_minutes ?? null, body.coach_id ?? null]
          );
          const after = await tx.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE ct.id = $1`, [request.params.id]);
          const b = before.rows[0]!;
          const a = after.rows[0]!;
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data)
             VALUES ($1, 'class_template.updated', 'class_template', $2, $3, $4::jsonb, $5::jsonb)`,
            [actor.userId, request.params.id, request.id,
              JSON.stringify({ active: b.active, capacity: b.capacity, durationMinutes: b.duration_minutes, coachId: b.coach_id }),
              JSON.stringify({ active: a.active, capacity: a.capacity, durationMinutes: a.duration_minutes, coachId: a.coach_id })]
          );
          return a;
        });
        return { template: templateJson(template) };
      } catch (error) {
        if (error instanceof RuleError) return sendRule(reply, error);
        if (pgCode(error) === "23505") return reply.code(409).send({
          error: "template_slot_taken",
          message: "That coach already has an active class at that weekday and time."
        });
        throw error;
      }
    }
  );

  // --- Generacion de instancias --------------------------------------------

  app.post<{ Body: { from_date: string; to_date: string } }>(
    "/api/v1/class-sessions/generate",
    {
      schema: {
        body: {
          type: "object",
          required: ["from_date", "to_date"],
          additionalProperties: false,
          properties: {
            from_date: { type: "string", pattern: DATE_PATTERN },
            to_date: { type: "string", pattern: DATE_PATTERN }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      const { from_date: from, to_date: to } = request.body;
      const range = validateGenerationRange(from, to);
      if (!range.ok) return reply.code(400).send({
        error: range.reason === "range_too_large" ? "date_range_too_large" : "invalid_date_range",
        message: range.reason === "range_too_large"
          ? "Class generation is limited to a 90-day window."
          : "Provide valid calendar dates with the end on or after the start."
      });

      const summary = await transactionalDb.transaction(async (tx) => {
        const candidates = `
          WITH days AS (
            SELECT g.d::date AS day FROM generate_series($1::date, $2::date, interval '1 day') AS g(d)
          )
          SELECT ct.id AS template_id, ct.capacity, ct.duration_minutes,
                 ((days.day + ct.local_start_time) AT TIME ZONE $3) AS starts_at
            FROM class_templates ct
            JOIN days ON EXTRACT(dow FROM days.day)::int = ct.weekday
           WHERE ct.active`;
        const wanted = await tx.query<{ n: number } & Record<string, unknown>>(
          `SELECT count(*)::int AS n FROM (${candidates}) c`, [from, to, config.gymTimezone]
        );
        const created = await tx.query<{ id: string; template_id: string; starts_at: string | Date; capacity_snapshot: number; local_date: string } & Record<string, unknown>>(
          `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot)
           SELECT c.template_id, c.starts_at, c.starts_at + (c.duration_minutes * interval '1 minute'), c.capacity
             FROM (${candidates}) c
           ON CONFLICT (template_id, starts_at) DO NOTHING
           RETURNING id, template_id, starts_at, capacity_snapshot,
                     to_char(starts_at AT TIME ZONE $3, 'YYYY-MM-DD') AS local_date`,
          [from, to, config.gymTimezone]
        );

        // Turnos fijos: cada instancia nueva reserva a quienes tienen el turno vigente.
        let confirmed = 0;
        let waitlisted = 0;
        for (const session of created.rows) {
          const holders = await tx.query<{ id: string; member_id: string; starts_on: string | Date; ends_on: string | Date | null } & Record<string, unknown>>(
            `SELECT ra.id, ra.member_id, ra.starts_on, ra.ends_on
               FROM recurring_assignments ra
               JOIN member_profiles mp ON mp.id = ra.member_id
              WHERE ra.template_id = $1 AND ra.active
                AND mp.status IN ('trial', 'active', 'debtor')
              ORDER BY ra.created_at, ra.id`,
            [session.template_id]
          );
          for (const holder of holders.rows) {
            if (!assignmentCoversDate(dateOnly(holder.starts_on)!, dateOnly(holder.ends_on), session.local_date)) continue;
            const count = await tx.query<{ n: number } & Record<string, unknown>>(
              "SELECT count(*)::int AS n FROM bookings WHERE session_id = $1 AND status = 'confirmed'", [session.id]
            );
            const status = (count.rows[0]?.n ?? 0) < session.capacity_snapshot ? "confirmed" : "waitlist";
            const booked = await tx.query(
              `INSERT INTO bookings (session_id, member_id, status, created_by)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (session_id, member_id) WHERE status IN ('confirmed', 'waitlist') DO NOTHING
               RETURNING id`,
              [session.id, holder.member_id, status, actor.userId]
            );
            if (booked.rowCount) {
              if (status === "confirmed") confirmed += 1; else waitlisted += 1;
            }
          }
        }
        const total = wanted.rows[0]?.n ?? 0;
        await tx.query(
          `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
           VALUES ($1, 'class_sessions.generated', 'class_sessions', $2, $3, $4::jsonb)`,
          [actor.userId, `${from}..${to}`, request.id, JSON.stringify({
            created: created.rowCount, alreadyExisting: total - (created.rowCount ?? 0), recurringConfirmed: confirmed, recurringWaitlisted: waitlisted
          })]
        );
        return {
          from, to, timezone: config.gymTimezone,
          created: created.rowCount ?? 0,
          alreadyExisting: total - (created.rowCount ?? 0),
          recurringBookings: { confirmed, waitlisted }
        };
      });
      return reply.code(summary.created > 0 ? 201 : 200).send(summary);
    }
  );

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/api/v1/class-sessions/:id/cancel",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
        body: { type: "object", additionalProperties: false, properties: { reason: { type: "string", maxLength: 200 } } }
      }
    },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const found = await tx.query<{ id: string; status: string; starts_at: string | Date; now: string | Date } & Record<string, unknown>>(
            "SELECT id, status, starts_at, clock_timestamp() AS now FROM class_sessions WHERE id = $1 FOR UPDATE", [request.params.id]
          );
          const session = found.rows[0];
          if (!session) throw new RuleError(404, "session_not_found", "The class session was not found.");
          if (session.status !== "scheduled") throw new RuleError(409, "session_not_cancellable", "Only a scheduled class session can be cancelled.");
          if (new Date(session.starts_at) <= new Date(session.now)) {
            throw new RuleError(409, "session_already_started", "A class session that already started cannot be cancelled.");
          }
          await tx.query("UPDATE class_sessions SET status = 'cancelled' WHERE id = $1", [session.id]);
          const released = await tx.query(
            `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
              WHERE session_id = $1 AND status IN ('confirmed', 'waitlist') RETURNING id`, [session.id]
          );
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason, after_data)
             VALUES ($1, 'class_session.cancelled', 'class_session', $2, $3, $4, $5::jsonb)`,
            [actor.userId, session.id, request.id, request.body.reason ?? null, JSON.stringify({ cancelledBookings: released.rowCount })]
          );
          return { id: session.id, status: "cancelled", cancelledBookings: released.rowCount ?? 0 };
        });
        return result;
      } catch (error) {
        if (error instanceof RuleError) return sendRule(reply, error);
        throw error;
      }
    }
  );

  // --- Turnos fijos -------------------------------------------------------

  app.get<{ Params: { id: string } }>(
    "/api/v1/class-templates/:id/assignments",
    { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const actor = await adminActor(request, reply, false);
      if (!actor) return;
      const rows = await db.query<AssignmentRow>(
        `SELECT id, member_id, template_id, starts_on, ends_on, active
           FROM recurring_assignments WHERE template_id = $1 AND active ORDER BY created_at, id`,
        [request.params.id]
      );
      return { assignments: rows.rows.map(assignmentJson) };
    }
  );

  app.post<{ Params: { id: string }; Body: { member_id: string; starts_on: string; ends_on?: string } }>(
    "/api/v1/class-templates/:id/assignments",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
        body: {
          type: "object",
          required: ["member_id", "starts_on"],
          additionalProperties: false,
          properties: {
            member_id: { type: "string", format: "uuid" },
            starts_on: { type: "string", pattern: DATE_PATTERN },
            ends_on: { type: "string", pattern: DATE_PATTERN }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      const { member_id: memberId, starts_on: startsOn, ends_on: endsOn } = request.body;
      if (!isValidCalendarDate(startsOn) || (endsOn !== undefined && (!isValidCalendarDate(endsOn) || endsOn < startsOn))) {
        return reply.code(400).send({
          error: "invalid_date_range",
          message: "Provide valid calendar dates with the end on or after the start."
        });
      }
      try {
        const assignment = await transactionalDb.transaction(async (tx) => {
          const template = await tx.query("SELECT 1 FROM class_templates WHERE id = $1 AND active", [request.params.id]);
          if (!template.rowCount) throw new RuleError(404, "template_not_found", "The active class template was not found.");
          const member = await tx.query("SELECT 1 FROM member_profiles WHERE id = $1 AND status <> 'exited'", [memberId]);
          if (!member.rowCount) throw new RuleError(422, "member_not_available", "The member does not exist or has left the gym.");
          const inserted = await tx.query<AssignmentRow>(
            `INSERT INTO recurring_assignments (member_id, template_id, starts_on, ends_on, created_by)
             VALUES ($1, $2, $3::date, $4::date, $5)
             RETURNING id, member_id, template_id, starts_on, ends_on, active`,
            [memberId, request.params.id, startsOn, endsOn ?? null, actor.userId]
          );
          const row = inserted.rows[0]!;
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
             VALUES ($1, 'recurring_assignment.created', 'recurring_assignment', $2, $3, $4::jsonb)`,
            [actor.userId, row.id, request.id, JSON.stringify({ templateId: request.params.id, startsOn, endsOn: endsOn ?? null })]
          );
          return row;
        });
        return reply.code(201).send({ assignment: assignmentJson(assignment) });
      } catch (error) {
        if (error instanceof RuleError) return sendRule(reply, error);
        if (pgCode(error) === "23505") return reply.code(409).send({
          error: "assignment_exists",
          message: "That member already has an active fixed slot in this class."
        });
        throw error;
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/recurring-assignments/:id/end",
    { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const actor = await adminActor(request, reply, true);
      if (!actor) return;
      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const found = await tx.query<AssignmentRow>(
            "SELECT id, member_id, template_id, starts_on, ends_on, active FROM recurring_assignments WHERE id = $1 FOR UPDATE",
            [request.params.id]
          );
          const row = found.rows[0];
          if (!row) throw new RuleError(404, "assignment_not_found", "The fixed slot was not found.");
          if (!row.active) throw new RuleError(409, "assignment_already_ended", "The fixed slot is already ended.");
          await tx.query(
            "UPDATE recurring_assignments SET active = false, ends_on = GREATEST(starts_on, LEAST(COALESCE(ends_on, current_date), current_date)) WHERE id = $1",
            [row.id]
          );
          // Las reservas ya generadas NO se tocan (pudieron hacerse a mano): se informa cuantas quedan.
          const upcoming = await tx.query<{ n: number } & Record<string, unknown>>(
            `SELECT count(*)::int AS n FROM bookings b
               JOIN class_sessions cs ON cs.id = b.session_id
              WHERE b.member_id = $1 AND cs.template_id = $2 AND cs.starts_at > now()
                AND b.status IN ('confirmed', 'waitlist')`,
            [row.member_id, row.template_id]
          );
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
             VALUES ($1, 'recurring_assignment.ended', 'recurring_assignment', $2, $3, $4::jsonb)`,
            [actor.userId, row.id, request.id, JSON.stringify({ upcomingBookingsKept: upcoming.rows[0]?.n ?? 0 })]
          );
          return { id: row.id, active: false, upcomingBookingsKept: upcoming.rows[0]?.n ?? 0 };
        });
        return result;
      } catch (error) {
        if (error instanceof RuleError) return sendRule(reply, error);
        throw error;
      }
    }
  );
}
