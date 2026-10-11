import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { generateTemporaryPassword, usernameCandidates, type AccountRole } from "../domain/credentials.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";
import { hashPassword } from "../security/password.js";

interface CreateAccountBody { role: AccountRole; memberId?: string; coachId?: string }
interface UserParams { id: string }

class AccountError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "AccountError";
  }
}

function sendAccountError(reply: FastifyReply, error: unknown) {
  if (error instanceof AccountError) return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "23505") return reply.code(409).send({ error: "account_conflict", message: "An account already exists for this profile or username." });
  throw error;
}

const PROFILE_TABLE: Record<AccountRole, string> = { member: "member_profiles", coach: "coach_profiles" };

export function registerAccountRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  async function requireAdmin(request: Parameters<typeof resolveActor>[0], reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) { reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." }); return null; }
    if (!actor.roles.includes("admin")) { reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." }); return null; }
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return null;
    return actor;
  }

  // Miembros y profesores con su acceso (o sin el): base de la pantalla «Accesos».
  app.get("/api/v1/admin/accounts", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    const rows = await db.query(
      `SELECT * FROM (
       SELECT 'member' AS role, p.id AS profile_id, p.full_name, p.status AS profile_status, u.id AS user_id, u.username, u.status AS account_status, u.must_change_password
         FROM member_profiles p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.anonymized_at IS NULL
       UNION ALL
       SELECT 'coach', p.id, p.full_name, CASE WHEN p.active THEN 'active' ELSE 'inactive' END, u.id, u.username, u.status, u.must_change_password
         FROM coach_profiles p LEFT JOIN users u ON u.id = p.user_id
       ) t ORDER BY role, lower(full_name)`
    );
    return reply.send({ accounts: rows.rows });
  });

  app.post<{ Body: CreateAccountBody }>("/api/v1/admin/accounts", {
    schema: {
      body: {
        type: "object", required: ["role"], additionalProperties: false,
        properties: {
          role: { type: "string", enum: ["member", "coach"] },
          memberId: { type: "string", format: "uuid" },
          coachId: { type: "string", format: "uuid" }
        }
      }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const { role, memberId, coachId } = request.body;
    const profileId = role === "member" ? memberId : coachId;
    if (!profileId || (role === "member" ? coachId : memberId)) {
      return reply.code(400).send({ error: "profile_required", message: "Provide the profile id that matches the role, and only that one." });
    }
    try {
      const created = await transactionalDb.transaction(async (tx) => {
        const profile = await tx.query<{ id: string; user_id: string | null; full_name: string; email: string | null } & Record<string, unknown>>(
          `SELECT id, user_id, full_name, email FROM ${PROFILE_TABLE[role]} WHERE id=$1 FOR UPDATE`, [profileId]
        );
        const row = profile.rows[0];
        if (!row) throw new AccountError(404, "profile_not_found", "The profile was not found.");
        if (row.user_id) throw new AccountError(409, "profile_already_linked", "This profile already has an account.");
        if (role === "member") {
          const anonymized = await tx.query("SELECT 1 FROM member_profiles WHERE id=$1 AND anonymized_at IS NOT NULL", [profileId]);
          if (anonymized.rows[0]) throw new AccountError(409, "profile_anonymized", "An anonymized member cannot receive an account.");
        }

        let username: string | null = null;
        for (const candidate of usernameCandidates(role, row.full_name)) {
          const taken = await tx.query("SELECT 1 FROM users WHERE username=$1 LIMIT 1", [candidate]);
          if (!taken.rows[0]) { username = candidate; break; }
        }
        if (!username) throw new AccountError(409, "username_unavailable", "No free username could be generated for this name.");

        // El correo de acceso es interno cuando la persona no tiene uno propio libre: entra con el usuario.
        let email = `${username}@cuentas.ikigai.invalid`;
        const profileEmail = row.email?.trim().toLowerCase();
        if (profileEmail) {
          const used = await tx.query("SELECT 1 FROM users WHERE email=$1 LIMIT 1", [profileEmail]);
          if (!used.rows[0]) email = profileEmail;
        }

        const temporaryPassword = generateTemporaryPassword(row.full_name);
        const inserted = await tx.query(
          `INSERT INTO users (email, username, password_hash, auth_provider, status, must_change_password)
           VALUES ($1,$2,$3,'local','active',true) RETURNING id`,
          [email, username, await hashPassword(temporaryPassword)]
        );
        const userId = String(inserted.rows[0]?.id ?? "");
        if (!userId) throw new Error("Account insert did not return an id.");
        await tx.query(`UPDATE ${PROFILE_TABLE[role]} SET user_id=$1, updated_at=now() WHERE id=$2 AND user_id IS NULL`, [userId, profileId]);
        await tx.query("INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,$2,$3)", [userId, role, actor.userId]);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.account_created','user',$2,$3,$4::jsonb)",
          [actor.userId, userId, request.id, JSON.stringify({ role, profileId })]
        );
        return { userId, username, role, fullName: row.full_name, temporaryPassword };
      });
      return reply.code(201).send({
        account: { userId: created.userId, username: created.username, role: created.role, fullName: created.fullName },
        temporaryPassword: created.temporaryPassword,
        mustChangePassword: true
      });
    } catch (error) {
      return sendAccountError(reply, error);
    }
  });

  app.post<{ Params: UserParams }>("/api/v1/admin/accounts/:id/reset-password", {
    schema: { params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query<{ id: string; username: string | null; full_name: string } & Record<string, unknown>>(
          `SELECT u.id, u.username,
                  COALESCE(mp.full_name, cp.full_name) AS full_name
             FROM users u
             LEFT JOIN member_profiles mp ON mp.user_id = u.id
             LEFT JOIN coach_profiles cp ON cp.user_id = u.id
            WHERE u.id=$1 AND u.status='active' AND u.auth_provider='local'
              AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.revoked_at IS NULL AND r.role IN ('member','coach'))
              AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.revoked_at IS NULL AND r.role='admin')
            FOR UPDATE OF u`,
          [request.params.id]
        );
        const user = found.rows[0];
        if (!user || !user.username) throw new AccountError(404, "account_not_found", "No resettable member or coach account was found.");
        const temporaryPassword = generateTemporaryPassword(user.full_name);
        await tx.query("UPDATE users SET password_hash=$2, must_change_password=true, updated_at=now() WHERE id=$1", [user.id, await hashPassword(temporaryPassword)]);
        await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [user.id]);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'user.password_reset_by_admin','user',$2,$3,$4::jsonb)",
          [actor.userId, user.id, request.id, JSON.stringify({ sessionRevocation: true })]
        );
        return { username: user.username, temporaryPassword };
      });
      return reply.send({ username: result.username, temporaryPassword: result.temporaryPassword, mustChangePassword: true });
    } catch (error) {
      return sendAccountError(reply, error);
    }
  });

  // Deshabilitar / habilitar el acceso de un miembro o profesor (sin anonimizar: conserva su historial). Quien se va
  // o se suspende deja de poder entrar y sus sesiones se cierran al instante; se puede volver a habilitar.
  for (const [action, from, to, audit] of [
    ["disable", "active", "suspended", "user.access_disabled"],
    ["enable", "suspended", "active", "user.access_enabled"]
  ] as const) {
    app.post<{ Params: UserParams }>(`/api/v1/admin/accounts/:id/${action}`, {
      schema: { params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    }, async (request, reply) => {
      const actor = await requireAdmin(request, reply);
      if (!actor) return;
      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const found = await tx.query<{ id: string } & Record<string, unknown>>(
            `SELECT u.id FROM users u
              WHERE u.id=$1 AND u.status=$2 AND u.auth_provider='local'
                AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.revoked_at IS NULL AND r.role IN ('member','coach'))
                AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.revoked_at IS NULL AND r.role='admin')
              FOR UPDATE OF u`,
            [request.params.id, from]
          );
          if (!found.rows[0]) {
            throw new AccountError(404, "account_not_found", action === "disable"
              ? "No active member or coach account was found (administrator accounts cannot be disabled here)."
              : "No disabled member or coach account was found.");
          }
          await tx.query("UPDATE users SET status=$2, updated_at=now() WHERE id=$1", [request.params.id, to]);
          let revoked = 0;
          if (action === "disable") {
            const sessions = await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [request.params.id]);
            revoked = sessions.rowCount ?? 0;
          }
          await tx.query(
            "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,$2,'user',$3,$4,$5::jsonb)",
            [actor.userId, audit, request.params.id, request.id, JSON.stringify({ status: to, revokedSessions: revoked })]
          );
          return { status: to };
        });
        return reply.send({ userId: request.params.id, accountStatus: result.status });
      } catch (error) {
        return sendAccountError(reply, error);
      }
    });
  }
}
