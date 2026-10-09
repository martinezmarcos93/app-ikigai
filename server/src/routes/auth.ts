import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { consumeSharedRateLimit, opaqueRateLimitKey } from "../security/rate-limit.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { csrfTokenFor, requireAllowedOrigin, requireCsrf } from "../security/csrf.js";

const SESSION_COOKIE = "ikigai_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const dummyPasswordHash = hashPassword("dummy-password-used-for-timing-equalization");

interface LoginBody {
  email: string;
  password: string;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  password_hash: string;
  member_id?: string | null;
  coach_id?: string | null;
}

interface SessionRow extends Record<string, unknown> {
  session_id: string;
  id: string;
  email: string;
  roles: string[];
  member_id?: string | null;
  coach_id?: string | null;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
    path: "/"
  });
}

async function currentSession(
  request: FastifyRequest,
  db: Database
): Promise<{ row: SessionRow; token: string } | null> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || token.length > 128) return null;

  const result = await db.query<SessionRow>(
    `SELECT s.id AS session_id, u.id, u.email, mp.id AS member_id, cp.id AS coach_id,
            array_remove(array_agg(DISTINCT ur.role), NULL) AS roles
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      GROUP BY s.id, u.id, u.email, mp.id, cp.id
      LIMIT 1`,
    [tokenHash(token)]
  );

  const row = result.rows[0];
  if (!row) return null;
  return { row, token };
}

export type PasswordResetDelivery = (email: string, resetUrl: string) => Promise<void>;

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
  transactionalDb?: TransactionalDatabase,
  passwordResetDelivery?: PasswordResetDelivery,
  passwordResetBaseUrl?: string
): void {
  app.post<{ Body: LoginBody }>(
    "/api/v1/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254, format: "email" },
            password: { type: "string", minLength: 1, maxLength: 128 }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!requireAllowedOrigin(request, reply, config)) return;
      const email = request.body.email.trim().toLowerCase();
      const ipLimit = await consumeSharedRateLimit(db, opaqueRateLimitKey("login-ip", request.ip), 10, 60);
      const emailLimit = await consumeSharedRateLimit(db, opaqueRateLimitKey("login-email", email), 5, 60);
      if (!ipLimit.allowed || !emailLimit.allowed) {
        const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
        reply.header("Retry-After", String(retryAfter));
        return reply.code(429).send({
          error: "too_many_attempts",
          message: "Too many authentication attempts. Try again later."
        });
      }
      const password = request.body.password;

      const result = await db.query<UserRow>(
        `SELECT u.id, u.email, u.password_hash, mp.id AS member_id, cp.id AS coach_id
           FROM users u
           LEFT JOIN member_profiles mp ON mp.user_id = u.id
           LEFT JOIN coach_profiles cp ON cp.user_id = u.id
          WHERE u.email = $1 AND u.status = 'active' AND u.auth_provider = 'local'
          LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      if (!user) {
        await verifyPassword(password, await dummyPasswordHash);
        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Email or password is incorrect."
        });
      }

      const passwordMatches = await verifyPassword(password, user.password_hash);
      if (!passwordMatches) {
        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Email or password is incorrect."
        });
      }

      const roleResult = await db.query<{ role: string } & Record<string, unknown>>(
        "SELECT role FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL ORDER BY role",
        [user.id]
      );
      const roles = roleResult.rows.map((row) => row.role);
      if (roles.length === 0) {
        return reply.code(403).send({
          error: "account_without_role",
          message: "This account is not assigned an active role."
        });
      }

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
      await db.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
         VALUES ($1, $2, $3, $4)`,
        [user.id, tokenHash(token), expiresAt.toISOString(), String(request.headers["user-agent"] ?? "").slice(0, 512) || null]
      );

      setSessionCookie(reply, token, config);
      return reply.code(200).send({
        user: { id: user.id, email: user.email, roles, memberId: user.member_id ?? null, coachId: user.coach_id ?? null },
        csrfToken: csrfTokenFor(token, config.sessionSecret),
        expiresAt: expiresAt.toISOString()
      });
    }
  );

  app.get("/api/v1/auth/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const session = await currentSession(request, db);
    if (!session) {
      clearSessionCookie(reply, config);
      return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
    }
    return reply.send({
      user: {
        id: session.row.id,
        email: session.row.email,
        roles: session.row.roles ?? [],
        memberId: session.row.member_id ?? null,
        coachId: session.row.coach_id ?? null
      },
      csrfToken: csrfTokenFor(session.token, config.sessionSecret)
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const session = await currentSession(request, db);
    if (session) {
      if (!requireCsrf(request, reply, session.token, config)) return;
      await db.query(
        "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
        [session.row.session_id]
      );
    } else if (!requireAllowedOrigin(request, reply, config)) {
      return;
    }
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });
}
