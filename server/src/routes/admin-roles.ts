import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface LinkCoachBody {
  email: string;
  coachId: string;
}

class RoleLinkError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "RoleLinkError";
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof RoleLinkError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  throw error;
}

/**
 * Links an existing active administrator account to its matching coach profile.
 * This adds the coach role; it never removes the admin role or creates another login.
 */
export function registerAdminRoleRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.post<{ Body: LinkCoachBody }>("/api/v1/admin/users/link-coach", {
    schema: {
      body: {
        type: "object",
        required: ["email", "coachId"],
        additionalProperties: false,
        properties: {
          email: { type: "string", format: "email", minLength: 3, maxLength: 254 },
          coachId: { type: "string", format: "uuid" }
        }
      }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const email = request.body.email.trim().toLowerCase();
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const users = await tx.query(
          "SELECT id,email,status FROM users WHERE email=$1 FOR UPDATE",
          [email]
        );
        const user = users.rows[0] as Record<string, unknown> | undefined;
        if (!user) throw new RoleLinkError(404, "account_not_found", "No account exists for this email.");
        if (user.status !== "active") throw new RoleLinkError(409, "account_not_active", "The account must be active before linking a coach profile.");

        const rolesResult = await tx.query(
          "SELECT role FROM user_roles WHERE user_id=$1 AND revoked_at IS NULL ORDER BY role",
          [user.id]
        );
        const roles = rolesResult.rows.map((row) => String(row.role));
        if (!roles.includes("admin")) {
          throw new RoleLinkError(409, "administrator_account_required", "This operation only adds a coach role to an existing administrator account.");
        }

        const profiles = await tx.query(
          "SELECT id,user_id,email FROM coach_profiles WHERE id=$1 FOR UPDATE",
          [request.body.coachId]
        );
        const profile = profiles.rows[0] as Record<string, unknown> | undefined;
        if (!profile) throw new RoleLinkError(404, "coach_not_found", "The coach profile was not found.");
        const profileEmail = String(profile.email ?? "").trim().toLowerCase();
        if (!profileEmail || profileEmail !== email) {
          throw new RoleLinkError(409, "coach_email_mismatch", "The coach profile email must match the existing administrator account email.");
        }
        if (profile.user_id && String(profile.user_id) !== String(user.id)) {
          throw new RoleLinkError(409, "coach_profile_already_linked", "This coach profile is already linked to another account.");
        }

        const alreadyLinked = String(profile.user_id ?? "") === String(user.id) && roles.includes("coach");
        if (!alreadyLinked) {
          await tx.query(
            "UPDATE coach_profiles SET user_id=$1, updated_at=now() WHERE id=$2 AND (user_id IS NULL OR user_id=$1)",
            [user.id, request.body.coachId]
          );
          if (!roles.includes("coach")) {
            await tx.query(
              "INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,'coach',$2)",
              [user.id, actor.userId]
            );
          }
          await tx.query(
            "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'user.coach_role_linked','user',$2,$3,$4::jsonb,$5::jsonb)",
            [actor.userId, user.id, request.id, JSON.stringify({ roles }), JSON.stringify({ roles: [...new Set([...roles, "coach"])], coachProfileId: request.body.coachId })]
          );
        }

        return {
          userId: String(user.id),
          email: String(user.email),
          coachId: String(request.body.coachId),
          roles: [...new Set([...roles, "coach"])].sort(),
          replayed: alreadyLinked
        };
      });
      return reply.send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
