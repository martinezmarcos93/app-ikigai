import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import type { Pool } from "pg";
import type { RuntimeConfig } from "./config.js";
import { canAccessMember, createSessionToken, hashSessionToken, normalizeEmail, type AuthUser, type Role } from "./security.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

type AppOptions = {
  pool: Pool;
  config: RuntimeConfig;
  passwordVerifier?: (hash: string, password: string) => Promise<boolean>;
};

const SESSION_COOKIE = "ikigai_session";

export function buildApp({ pool, config, passwordVerifier = argon2.verify }: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    bodyLimit: 32 * 1024,
    requestIdHeader: "x-request-id",
    disableRequestLogging: config.nodeEnv === "test",
  });

  app.decorateRequest("authUser", null);

  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  app.register(cookie);
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ error: "rate_limit_exceeded", message: "Demasiadas solicitudes. Intentá nuevamente más tarde." }),
  });

  app.addHook("onRequest", async (request, reply) => {
    const method = request.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const origin = request.headers.origin;
      if (origin !== config.appOrigin) {
        return reply.code(403).send({ error: "invalid_origin", message: "Origen no autorizado." });
      }
    }
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      reply.code(401).send({ error: "unauthenticated", message: "Iniciá sesión para continuar." });
      return;
    }

    const tokenHash = hashSessionToken(token, config.sessionPepper);
    const result = await pool.query<{
      id: string; email: string; role: Role; member_id: string | null; coach_id: string | null;
    }>(
      `SELECT u.id, u.email, u.role, u.member_id, u.coach_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
       LIMIT 1`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      reply.clearCookie(SESSION_COOKIE, { path: "/", sameSite: "strict", secure: config.nodeEnv === "production", httpOnly: true });
      reply.code(401).send({ error: "unauthenticated", message: "La sesión venció o ya no es válida." });
      return;
    }

    request.authUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      memberId: row.member_id,
      coachId: row.coach_id,
    };
  }

  app.post<{ Body: { email?: string; password?: string } }>("/api/v1/auth/login", {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const email = typeof request.body?.email === "string" ? normalizeEmail(request.body.email) : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!email || email.length > 254 || !password || password.length > 1024) {
      return reply.code(400).send({ error: "invalid_input", message: "Ingresá email y contraseña válidos." });
    }

    const result = await pool.query<{
      id: string; email: string; password_hash: string; role: Role;
      member_id: string | null; coach_id: string | null;
    }>(
      `SELECT id, email, password_hash, role, member_id, coach_id
       FROM users WHERE email_normalized = $1 AND status = 'active' LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    const validPassword = user ? await passwordVerifier(user.password_hash, password) : false;
    if (!user || !validPassword) {
      return reply.code(401).send({ error: "invalid_credentials", message: "Email o contraseña incorrectos." });
    }

    const rawToken = createSessionToken();
    const tokenHash = hashSessionToken(rawToken, config.sessionPepper);
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash, user.id, expiresAt],
    );

    reply.setCookie(SESSION_COOKIE, rawToken, {
      path: "/",
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
      expires: expiresAt,
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      expiresAt: expiresAt.toISOString(),
    };
  });

  app.post("/api/v1/auth/logout", { preHandler: requireUser }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token, config.sessionPepper)]);
    }
    reply.clearCookie(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
    });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", { preHandler: requireUser }, async (request) => ({
    user: request.authUser,
  }));

  app.post<{ Body: {
    firstName?: string; lastName?: string; email?: string; phone?: string;
    address?: string; dni?: string; status?: string; emergencyContactName?: string;
    emergencyContactPhone?: string; notes?: string;
  } }>("/api/v1/members", { preHandler: requireUser }, async (request, reply) => {
    if (request.authUser?.role !== "admin") {
      return reply.code(403).send({ error: "forbidden", message: "Sólo administración puede dar de alta miembros." });
    }

    const body = request.body ?? {};
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const address = typeof body.address === "string" ? body.address.trim() : null;
    const dni = typeof body.dni === "string" ? body.dni.trim() : null;
    const emergencyContactName = typeof body.emergencyContactName === "string" ? body.emergencyContactName.trim() : null;
    const emergencyContactPhone = typeof body.emergencyContactPhone === "string" ? body.emergencyContactPhone.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const status = body.status ?? "trial";
    const allowedStatuses = new Set(["trial", "active", "suspended", "debtor", "exited"]);

    if (firstName.length < 1 || firstName.length > 100 || lastName.length < 1 || lastName.length > 100) {
      return reply.code(400).send({ error: "invalid_input", message: "Nombre y apellido son obligatorios y deben tener hasta 100 caracteres." });
    }
    if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return reply.code(400).send({ error: "invalid_input", message: "El email no tiene un formato válido." });
    }
    if (![phone, address, dni, emergencyContactName, emergencyContactPhone, notes].every((v) => v === null || v.length <= 1000)) {
      return reply.code(400).send({ error: "invalid_input", message: "Uno o más campos exceden la longitud permitida." });
    }
    if (typeof status !== "string" || !allowedStatuses.has(status)) {
      return reply.code(400).send({ error: "invalid_input", message: "El estado del miembro no es válido." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO members
          (first_name, last_name, email, phone, address, dni, status, emergency_contact_name, emergency_contact_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, first_name, last_name, email, phone, address, dni, status, joined_at, emergency_contact_name, emergency_contact_phone`,
        [firstName, lastName, email, phone, address, dni, status, emergencyContactName, emergencyContactPhone, notes],
      );
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, after_data, request_id)
         VALUES ($1, 'member.created', 'member', $2, $3::jsonb, $4)`,
        [request.authUser.id, created.id, JSON.stringify({ firstName, lastName, email, status }), request.id],
      );
      await client.query("COMMIT");
      return reply.code(201).send({ member: created });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/v1/members", { preHandler: requireUser }, async (request, reply) => {
    const user = request.authUser!;
    if (user.role === "admin") {
      const result = await pool.query(
        `SELECT id, first_name, last_name, email, phone, status, joined_at, left_at
         FROM members ORDER BY last_name, first_name LIMIT 500`,
      );
      return { members: result.rows };
    }
    if (user.role === "member" && user.memberId) {
      const result = await pool.query(
        `SELECT id, first_name, last_name, email, phone, status, joined_at, left_at
         FROM members WHERE id = $1 LIMIT 1`,
        [user.memberId],
      );
      return { members: result.rows };
    }
    if (user.role === "coach" && user.coachId) {
      const result = await pool.query(
        `SELECT m.id, m.first_name, m.last_name, m.email, m.phone, m.status, m.joined_at, m.left_at
         FROM members m
         JOIN coach_member_assignments a ON a.member_id = m.id
         WHERE a.coach_id = $1 AND a.active = true
         ORDER BY m.last_name, m.first_name LIMIT 500`,
        [user.coachId],
      );
      return { members: result.rows };
    }
    return reply.code(403).send({ error: "forbidden", message: "El usuario no tiene un perfil operativo asociado." });
  });

  app.get<{ Params: { id: string } }>("/api/v1/members/:id", { preHandler: requireUser }, async (request, reply) => {
    const memberId = request.params.id;
    const user = request.authUser!;
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
      return reply.code(404).send({ error: "not_found", message: "Miembro no encontrado." });
    }

    let allowed = user.role === "admin";
    if (user.role === "member") allowed = user.memberId === memberId;
    if (user.role === "coach" && user.coachId) {
      const assignment = await pool.query(
        "SELECT 1 FROM coach_member_assignments WHERE coach_id = $1 AND member_id = $2 AND active = true LIMIT 1",
        [user.coachId, memberId],
      );
      allowed = assignment.rowCount === 1;
    }
    if (!allowed) {
      return reply.code(404).send({ error: "not_found", message: "Miembro no encontrado." });
    }

    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone, address, status, joined_at, left_at, emergency_contact_name, emergency_contact_phone
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "not_found", message: "Miembro no encontrado." });
    return { member: result.rows[0] };
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "API request failed");
    if (reply.sent) return;
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({
      error: status === 500 ? "internal_error" : "request_error",
      message: status === 500 ? "Ocurrió un error interno." : error.message,
      requestId: request.id,
    });
  });

  app.addHook("onClose", async () => {
    // Pool ownership belongs to the process entrypoint; tests can reuse injected pools.
  });

  return app;
}