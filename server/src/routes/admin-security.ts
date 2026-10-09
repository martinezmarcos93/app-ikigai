import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface UserParams { id: string }

class AdminSecurityError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "AdminSecurityError";
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AdminSecurityError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  throw error;
}

export function registerAdminSecurityRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.post<{ Params: UserParams }>("/api/v1/admin/users/:id/sessions/revoke", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", format: "uuid" } }
      }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query(
          "SELECT id,status FROM users WHERE id=$1 FOR UPDATE",
          [request.params.id]
        );
        const target = found.rows[0] as Record<string, unknown> | undefined;
        if (!target) throw new AdminSecurityError(404, "user_not_found", "The user was not found.");

        const revoked = await tx.query(
          "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL RETURNING id",
          [request.params.id]
        );
        const count = revoked.rowCount ?? revoked.rows.length;
        if (count > 0) {
          await tx.query(
            "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'user.sessions_revoked','user',$2,$3,$4::jsonb,$5::jsonb)",
            [actor.userId, request.params.id, request.id, JSON.stringify({ activeSessions: count }), JSON.stringify({ revokedSessions: count })]
          );
        }
        return { userId: request.params.id, revokedSessions: count, replayed: count === 0 };
      });
      return reply.send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
