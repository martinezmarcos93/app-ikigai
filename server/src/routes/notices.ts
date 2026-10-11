import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

// Avisos del miembro sobre una reserva suya: «no voy a poder ir» o «llego tarde». Son INFORMATIVOS para el profesor
// y administracion: no cancelan la reserva, no liberan el cupo y no generan cargos ni sanciones. Para liberar el cupo
// hay que cancelar la reserva (con el corte de 40 minutos). Un aviso se puede cambiar o quitar hasta que empieza la clase.

class NoticeRuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "NoticeRuleError";
  }
}

const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;

export function registerNoticeRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  async function handle(
    request: Parameters<typeof resolveActor>[0] & { id: string; params: { id: string }; body: unknown },
    reply: FastifyReply,
    work: (tx: Database, actorUserId: string, booking: { id: string; session_id: string; status: string }) => Promise<unknown>
  ) {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query<{ id: string; session_id: string; member_id: string; status: string; starts_at: string | Date; now: string | Date } & Record<string, unknown>>(
          `SELECT b.id, b.session_id, b.member_id, b.status, cs.starts_at, clock_timestamp() AS now
             FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
            WHERE b.id = $1 FOR UPDATE OF b`,
          [request.params.id]
        );
        const booking = found.rows[0];
        const isOwner = Boolean(booking) && actor.roles.includes("member") && actor.memberId === booking!.member_id;
        // Quien no es dueño ni administrador no puede ni confirmar que la reserva existe.
        if (!booking || !(isOwner || actor.roles.includes("admin"))) {
          throw new NoticeRuleError(404, "not_found", "The requested resource was not found.");
        }
        if (booking.status === "cancelled") throw new NoticeRuleError(409, "booking_cancelled", "A cancelled booking cannot have a notice.");
        if (new Date(booking.starts_at) <= new Date(booking.now)) {
          throw new NoticeRuleError(409, "class_already_started", "Notices can only be changed before the class starts.");
        }
        return work(tx, actor.userId, booking);
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof NoticeRuleError) return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
      throw error;
    }
  }

  app.put<{ Params: { id: string }; Body: { kind: "absence" | "late"; note?: string } }>(
    "/api/v1/bookings/:id/notice",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          required: ["kind"],
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["absence", "late"] },
            note: { type: "string", maxLength: 200 }
          }
        }
      }
    },
    async (request, reply) => handle(request as never, reply, async (tx, userId, booking) => {
      const note = request.body.note?.trim() || null;
      const saved = await tx.query<{ kind: string; note: string | null; updated_at: string | Date } & Record<string, unknown>>(
        `INSERT INTO booking_notices (booking_id, kind, note, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (booking_id) DO UPDATE SET kind = EXCLUDED.kind, note = EXCLUDED.note, updated_at = clock_timestamp()
         RETURNING kind, note, updated_at`,
        [booking.id, request.body.kind, note, userId]
      );
      await tx.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
         VALUES ($1, 'booking.notice_set', 'booking', $2, $3, $4::jsonb)`,
        [userId, booking.id, request.id, JSON.stringify({ kind: request.body.kind, hasNote: note !== null })]
      );
      const row = saved.rows[0]!;
      return { bookingId: booking.id, notice: { kind: row.kind, note: row.note, updatedAt: row.updated_at } };
    })
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/bookings/:id/notice",
    { schema: { params: idParams } },
    async (request, reply) => handle(request as never, reply, async (tx, userId, booking) => {
      const removed = await tx.query("DELETE FROM booking_notices WHERE booking_id = $1 RETURNING id", [booking.id]);
      if (removed.rowCount) {
        await tx.query(
          `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id)
           VALUES ($1, 'booking.notice_removed', 'booking', $2, $3)`,
          [userId, booking.id, request.id]
        );
      }
      return { bookingId: booking.id, notice: null };
    })
  );
}
