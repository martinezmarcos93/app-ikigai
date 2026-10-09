import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { hashPassword, verifyPassword } from "../security/password.js";

const SESSION_COOKIE = "ikigai_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;\nconst dummyPasswordHash = hashPassword("dummy-password-used-for-timing-equalization");

interface LoginBody {
  email: string;
  password: string;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  password_hash: string;
}

interface SessionRow extends Record<string, unknown> {
  session_id: string;
  id: string;
  email: string;
  roles: string[];
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function csrfFor(sessionToken: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionToken).digest("base64url");
}

function safeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function originAllowed(request: FastifyRequest, reply: FastifyReply, config: AppConfig): boolean {
  const origin = request.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) return true;
  reply.code(403).send({
    error: "origin_not_allowed",
    message: "The request origin is not allowed."
  });
  return false;
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
    `SELECT s.id AS session_id, u.id, u.email,
            array_remove(array_agg(DISTINCT ur.role), NULL) AS roles
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      GROUP BY s.id, u.id, u.email
      LIMIT 1`,
    [tokenHash(token)]
  );

  const row = result.rows[0];
  if (!row) return null;
  return { row, token };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig
): void {
  app.post<{ Body: LoginBody }>(
    "/api/v1/auth/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
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
      if (!originAllowed(request, reply, config)) return;
      const email = request.body.email.trim().toLowerCase();
      const password = request.body.password;

      const result = await db.query<UserRow>(
        `SELECT id, email, password_hash
           FROM users
          WHERE email = $1 AND status = 'active' AND auth_provider = 'local'
          LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      if (!user) {
        // Equalize the dominant password-hashing cost for unknown accounts.
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
        user: { id: user.id, email: user.email, roles },
        csrfToken: csrfFor(token, config.sessionSecret),
        expiresAt: expiresAt.toISOString()
      });
    }
  );

  app.get("/api/v1/auth/me", async (request, reply) => {
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
        roles: session.row.roles ?? []
      },
      csrfToken: csrfFor(session.token, config.sessionSecret)
    });
  });

  app.post<{ Body: { [key: string]: never } }>(
    "/api/v1/auth/logout",
    { schema: { body: { type: "object", additionalProperties: false } } },
    async (request, reply) => {
      if (!originAllowed(request, reply, config)) return;
      const session = await currentSession(request, db);
      if (session) {
        const supplied = request.headers["x-csrf-token"];
        const expected = csrfFor(session.token, config.sessionSecret);
        if (typeof supplied !== "string" || !safeStringEqual(supplied, expected)) {
          return reply.code(403).send({
            error: "csrf_validation_failed",
            message: "The request could not be validated."
          });
        }
        await db.query(
          "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
          [session.row.session_id]
        );
      }
      clearSessionCookie(reply, config);
      return reply.code(204).send();
    }
  );
}
