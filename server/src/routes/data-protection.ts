import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { hashPassword } from "../security/password.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

// Proteccion de datos personales (Ley 25.326): acceso/portabilidad (exportacion) y supresion (anonimizacion) de los
// datos de un miembro. Ver docs/DATA_PROTECTION.md. La anonimizacion conserva lo que la contabilidad y la integridad
// exigen (movimientos de cuenta, membresias, reservas y asistencia, sin la identidad) y borra lo que identifica a la persona.

export const ANONYMIZED_NAME = "Persona anonimizada";

class DataRuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "DataRuleError";
  }
}

const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;

export function registerDataProtectionRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });

  // --- Exportacion: el propio miembro o administracion --------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/api/v1/members/:id/export",
    { schema: { params: idParams } },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
      const memberId = request.params.id;
      const isAdmin = actor.roles.includes("admin");
      const isOwner = actor.roles.includes("member") && actor.memberId === memberId;
      // Quien no es el titular ni administracion no puede ni saber si el perfil existe.
      if (!isAdmin && !isOwner) return notFound(reply);

      const member = await db.query(
        `SELECT id, full_name, email, phone, address, dni, emergency_contact_name, emergency_contact_phone,
                status, joined_on, exited_on, notes, created_at, anonymized_at
           FROM member_profiles WHERE id = $1`, [memberId]
      );
      if (!member.rows[0]) return notFound(reply);
      const [account, memberships, ledger, bookings, notices, attendance, routines, gameRuns, rewardPoints] = await Promise.all([
        db.query(
          `SELECT u.email, u.status, u.created_at FROM users u JOIN member_profiles mp ON mp.user_id = u.id WHERE mp.id = $1`, [memberId]),
        db.query(
          `SELECT m.starts_on, m.ends_on, m.billing_period, m.agreed_price, m.status, s.name AS service
             FROM memberships m JOIN services s ON s.id = m.service_id WHERE m.member_id = $1 ORDER BY m.starts_on, m.id`, [memberId]),
        db.query(
          `SELECT entry_type, direction, amount, description, occurred_on, applied_period, payment_method, reference, created_at
             FROM ledger_entries WHERE member_id = $1 ORDER BY occurred_on, created_at, id`, [memberId]),
        db.query(
          `SELECT b.status, b.created_at, b.cancelled_at, cs.starts_at, s.name AS service
             FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
             JOIN class_templates ct ON ct.id = cs.template_id JOIN services s ON s.id = ct.service_id
            WHERE b.member_id = $1 ORDER BY cs.starts_at, b.id`, [memberId]),
        db.query(
          `SELECT bn.kind, bn.note, bn.created_at, cs.starts_at
             FROM booking_notices bn JOIN bookings b ON b.id = bn.booking_id
             JOIN class_sessions cs ON cs.id = b.session_id WHERE b.member_id = $1 ORDER BY cs.starts_at`, [memberId]),
        db.query(
          `SELECT ar.attended, ar.arrived_late, ar.recorded_at, cs.starts_at, s.name AS service
             FROM attendance_records ar JOIN bookings b ON b.id = ar.booking_id
             JOIN class_sessions cs ON cs.id = b.session_id
             JOIN class_templates ct ON ct.id = cs.template_id JOIN services s ON s.id = ct.service_id
            WHERE b.member_id = $1 ORDER BY cs.starts_at`, [memberId]),
        db.query(
          `SELECT r.name AS routine, ra.starts_on, ra.ends_on, ra.notes
             FROM routine_assignments ra JOIN routine_versions rv ON rv.id = ra.routine_version_id
             JOIN routines r ON r.id = rv.routine_id WHERE ra.member_id = $1 ORDER BY ra.starts_on, ra.id`, [memberId]),
        db.query(
          `SELECT status, started_at, finished_at, reps, perfect_reps, score, points_awarded
             FROM game_runs WHERE member_id = $1 ORDER BY started_at, id`, [memberId]),
        db.query(
          `SELECT delta, kind, note, created_at FROM reward_points WHERE member_id = $1 ORDER BY created_at, id`, [memberId])
      ]);
      // La exportacion es un acceso a datos personales: queda registrada (sin su contenido).
      await db.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id)
         VALUES ($1, 'member.data_exported', 'member_profile', $2, $3)`, [actor.userId, memberId, request.id]
      );
      reply.header("Content-Disposition", `attachment; filename="ikigai-datos-${memberId}.json"`);
      return {
        format: "ikigai-member-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        member: member.rows[0],
        account: account.rows[0] ?? null,
        memberships: memberships.rows,
        ledgerEntries: ledger.rows,
        bookings: bookings.rows,
        bookingNotices: notices.rows,
        attendance: attendance.rows,
        routineAssignments: routines.rows,
        gameRuns: gameRuns.rows,
        rewardPoints: rewardPoints.rows
      };
    }
  );

  // --- Supresion (anonimizacion): solo administracion, solo de quien dejo el gimnasio ------------------
  app.post<{ Params: { id: string }; Body: { reason: string; confirm: string } }>(
    "/api/v1/members/:id/anonymize",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          required: ["reason", "confirm"],
          additionalProperties: false,
          properties: {
            reason: { type: "string", minLength: 5, maxLength: 200 },
            confirm: { type: "string", enum: ["ANONIMIZAR"] }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
      if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
      const memberId = request.params.id;
      // Hash de una contrasena aleatoria que nadie conoce: la cuenta queda deshabilitada y sin forma de entrar.
      const unusable = await hashPassword(randomBytes(32).toString("base64url"));
      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const found = await tx.query<{ id: string; status: string; user_id: string | null; anonymized_at: string | Date | null } & Record<string, unknown>>(
            "SELECT id, status, user_id, anonymized_at FROM member_profiles WHERE id = $1 FOR UPDATE", [memberId]
          );
          const member = found.rows[0];
          if (!member) throw new DataRuleError(404, "not_found", "The requested resource was not found.");
          if (member.anonymized_at) return { memberId, alreadyAnonymized: true as const };
          if (member.status !== "exited") {
            throw new DataRuleError(409, "member_not_exited", "Only a member who left the gym can be anonymized; set the status to exited first.");
          }
          const upcoming = await tx.query(
            `SELECT 1 FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
              WHERE b.member_id = $1 AND b.status IN ('confirmed', 'waitlist') AND cs.starts_at > now() LIMIT 1`, [memberId]
          );
          if (upcoming.rowCount) {
            throw new DataRuleError(409, "member_has_upcoming_bookings", "Cancel the member's upcoming bookings before anonymizing.");
          }
          const open = await tx.query(
            "SELECT 1 FROM memberships WHERE member_id = $1 AND status IN ('scheduled', 'active', 'paused') LIMIT 1", [memberId]
          );
          if (open.rowCount) {
            throw new DataRuleError(409, "member_has_open_memberships", "End the member's memberships before anonymizing.");
          }
          await tx.query(
            `UPDATE member_profiles
                SET full_name = $2, email = NULL, phone = NULL, address = NULL, dni = NULL,
                    emergency_contact_name = NULL, emergency_contact_phone = NULL, notes = NULL,
                    anonymized_at = clock_timestamp(), updated_at = clock_timestamp()
              WHERE id = $1`, [memberId, ANONYMIZED_NAME]
          );
          // Las notas libres de los avisos y de las rutinas pueden nombrar a la persona.
          await tx.query("UPDATE booking_notices SET note = NULL WHERE booking_id IN (SELECT id FROM bookings WHERE member_id = $1)", [memberId]);
          await tx.query("UPDATE routine_assignments SET notes = NULL WHERE member_id = $1", [memberId]);
          let accountClosed = false;
          if (member.user_id) {
            await tx.query(
              `UPDATE users SET email = $2, username = NULL, must_change_password = false, password_hash = $3, status = 'disabled', updated_at = clock_timestamp() WHERE id = $1`,
              [member.user_id, `anonimizado-${member.user_id}@anonimizado.invalid`, unusable]
            );
            await tx.query("UPDATE sessions SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL", [member.user_id]);
            await tx.query("UPDATE user_invitations SET revoked_at = clock_timestamp() WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL", [member.user_id]);
            await tx.query("UPDATE password_reset_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL", [member.user_id]);
            accountClosed = true;
          }
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason, after_data)
             VALUES ($1, 'member.anonymized', 'member_profile', $2, $3, $4, $5::jsonb)`,
            [actor.userId, memberId, request.id, request.body.reason, JSON.stringify({ accountClosed })]
          );
          return { memberId, alreadyAnonymized: false as const, accountClosed };
        });
        return result;
      } catch (error) {
        if (error instanceof DataRuleError) return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
        throw error;
      }
    }
  );
}
