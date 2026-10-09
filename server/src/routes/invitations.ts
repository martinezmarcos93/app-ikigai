import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireAllowedOrigin, requireCsrf } from "../security/csrf.js";
import { hashPassword } from "../security/password.js";

interface CreateInvitationBody {
  email: string;
  role: "member" | "coach";
  memberId?: string;
  coachId?: string;
}
interface AcceptInvitationBody {
  token: string;
  password: string;
}

class InvitationError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sendInvitationError(reply: FastifyReply, error: unknown) {
  if (error instanceof InvitationError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "23505") {
    return reply.code(409).send({ error: "invitation_conflict", message: "An account or invitation already exists for this identity." });
  }
  if (code === "23514" || code === "23502" || code === "22P02") {
    return reply.code(400).send({ error: "invalid_invitation", message: "The invitation data is invalid." });
  }
  throw error;
}

export function registerInvitationRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.post<{ Body: CreateInvitationBody }>("/api/v1/admin/invitations", {
    schema: {
      body: {
        type: "object", required: ["email", "role"], additionalProperties: false,
        properties: {
          email: { type: "string", format: "email", minLength: 3, maxLength: 254 },
          role: { type: "string", enum: ["member", "coach"] },
          memberId: { type: "string", format: "uuid" },
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
    const role = request.body.role;
    if (role === "member" && (!request.body.memberId || request.body.coachId)) {
      return reply.code(400).send({ error: "profile_required", message: "A member invitation requires memberId only." });
    }
    if (role === "coach" && (!request.body.coachId || request.body.memberId)) {
      return reply.code(400).send({ error: "profile_required", message: "A coach invitation requires coachId only." });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const digest = tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const placeholderPassword = await hashPassword(randomBytes(32).toString("base64url"));

    try {
      const invitation = await transactionalDb.transaction(async (tx) => {
        const existingUser = await tx.query("SELECT id FROM users WHERE email=$1 LIMIT 1", [email]);
        if (existingUser.rows[0]) throw new InvitationError(409, "account_exists", "An account already exists for this email.");

        if (role === "member") {
          const profile = await tx.query("SELECT id,user_id FROM member_profiles WHERE id=$1 FOR UPDATE", [request.body.memberId]);
          if (!profile.rows[0]) throw new InvitationError(404, "member_not_found", "The member profile was not found.");
          if (profile.rows[0].user_id) throw new InvitationError(409, "profile_already_linked", "This member profile already has a login.");
        } else {
          const profile = await tx.query("SELECT id,user_id FROM coach_profiles WHERE id=$1 FOR UPDATE", [request.body.coachId]);
          if (!profile.rows[0]) throw new InvitationError(404, "coach_not_found", "The coach profile was not found.");
          if (profile.rows[0].user_id) throw new InvitationError(409, "profile_already_linked", "This coach profile already has a login.");
        }

        const insertedUser = await tx.query(
          "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','disabled') RETURNING id",
          [email, placeholderPassword]
        );
        const userId = String(insertedUser.rows[0]?.id ?? "");
        if (!userId) throw new Error("Invitation user insert did not return an id.");

        if (role === "member") {
          await tx.query("UPDATE member_profiles SET user_id=$1, updated_at=now() WHERE id=$2 AND user_id IS NULL", [userId, request.body.memberId]);
        } else {
          await tx.query("UPDATE coach_profiles SET user_id=$1, updated_at=now() WHERE id=$2 AND user_id IS NULL", [userId, request.body.coachId]);
        }
        await tx.query("INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,$2,$3)", [userId, role, actor.userId]);
        const insertedInvitation = await tx.query(
          "INSERT INTO user_invitations (user_id,token_hash,created_by,expires_at) VALUES ($1,$2,$3,$4) RETURNING id,expires_at",
          [userId, digest, actor.userId, expiresAt.toISOString()]
        );
        const row = insertedInvitation.rows[0];
        if (!row) throw new Error("Invitation insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.invitation_created','user',$2,$3,$4::jsonb)",
          [actor.userId, userId, request.id, JSON.stringify({ email, role, invitationId: row.id, expiresAt: expiresAt.toISOString() })]
        );
        return { id: String(row.id), userId, email, role, expiresAt: new Date(row.expires_at as string | Date).toISOString() };
      });
      return reply.code(201).send({
        invitation,
        invitationToken: rawToken,
        delivery: "manual_secure_delivery_required"
      });
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin/invitations/:id/revoke", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query(
          "SELECT id,user_id,accepted_at,revoked_at FROM user_invitations WHERE id=$1 FOR UPDATE",
          [request.params.id]
        );
        const invitation = found.rows[0] as Record<string, unknown> | undefined;
        if (!invitation) throw new InvitationError(404, "invitation_not_found", "The invitation was not found.");
        if (invitation.accepted_at) throw new InvitationError(409, "invitation_already_accepted", "An accepted invitation cannot be revoked.");
        if (invitation.revoked_at) return { revoked: true, replayed: true };
        await tx.query("UPDATE user_invitations SET revoked_at=now() WHERE id=$1", [request.params.id]);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.invitation_revoked','user',$2,$3,$4::jsonb)",
          [actor.userId, String(invitation.user_id), request.id, JSON.stringify({ invitationId: request.params.id })]
        );
        return { revoked: true, replayed: false };
      });
      return reply.send(result);
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin/invitations/:id/resend", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const rawToken = randomBytes(32).toString("base64url");
    const digest = tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      const invitation = await transactionalDb.transaction(async (tx) => {
        const currentResult = await tx.query(
          "SELECT id,user_id,accepted_at,revoked_at FROM user_invitations WHERE id=$1 FOR UPDATE",
          [request.params.id]
        );
        const current = currentResult.rows[0] as Record<string, unknown> | undefined;
        if (!current) throw new InvitationError(404, "invitation_not_found", "The invitation was not found.");
        if (current.accepted_at) throw new InvitationError(409, "invitation_already_accepted", "An accepted invitation cannot be resent.");
        if (current.revoked_at) throw new InvitationError(409, "invitation_already_replaced", "This invitation has already been revoked or replaced. Use the latest invitation instead.");

        const userResult = await tx.query("SELECT id,email,status FROM users WHERE id=$1 FOR UPDATE", [current.user_id]);
        const user = userResult.rows[0] as Record<string, unknown> | undefined;
        if (!user || user.status !== "disabled") {
          throw new InvitationError(409, "account_not_invitable", "This account is no longer awaiting activation.");
        }

        await tx.query(
          "UPDATE user_invitations SET revoked_at=now() WHERE user_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL",
          [current.user_id]
        );
        const inserted = await tx.query(
          "INSERT INTO user_invitations (user_id,token_hash,created_by,expires_at) VALUES ($1,$2,$3,$4) RETURNING id,expires_at",
          [current.user_id, digest, actor.userId, expiresAt.toISOString()]
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Replacement invitation insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.invitation_resent','user',$2,$3,$4::jsonb)",
          [actor.userId, String(current.user_id), request.id, JSON.stringify({ invitationId: row.id, expiresAt: expiresAt.toISOString() })]
        );
        return {
          id: String(row.id),
          userId: String(current.user_id),
          email: String(user.email),
          expiresAt: new Date(row.expires_at as string | Date).toISOString()
        };
      });
      return reply.code(201).send({
        invitation,
        invitationToken: rawToken,
        delivery: "manual_secure_delivery_required"
      });
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });

  app.post<{ Body: AcceptInvitationBody }>("/api/v1/auth/accept-invitation", {
    schema: {
      body: {
        type: "object", required: ["token", "password"], additionalProperties: false,
        properties: {
          token: { type: "string", minLength: 40, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
          password: { type: "string", minLength: 12, maxLength: 128 }
        }
      }
    },
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!requireAllowedOrigin(request, reply, config)) return;
    const passwordHash = await hashPassword(request.body.password);
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query(
          `SELECT id,user_id,expires_at FROM user_invitations
            WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
            LIMIT 1 FOR UPDATE`,
          [tokenHash(request.body.token)]
        );
        const invitation = found.rows[0];
        if (!invitation) throw new InvitationError(400, "invitation_invalid", "The invitation is invalid, expired, or already used.");
        const userId = String(invitation.user_id);
        const activated = await tx.query(
          "UPDATE users SET password_hash=$1,status='active',updated_at=now() WHERE id=$2 AND status='disabled' RETURNING id,email",
          [passwordHash, userId]
        );
        if (!activated.rows[0]) throw new InvitationError(409, "account_not_activatable", "This account can no longer be activated.");
        await tx.query("UPDATE user_invitations SET accepted_at=now() WHERE id=$1", [invitation.id]);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.invitation_accepted','user',$2,$3,$4::jsonb)",
          [userId, userId, request.id, JSON.stringify({ email: activated.rows[0].email })]
        );
        return { email: String(activated.rows[0].email) };
      });
      return reply.code(200).send({ accepted: true, email: result.email, next: "login" });
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });
}
