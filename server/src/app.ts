import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config.js";
import type { Database, TransactionalDatabase } from "./db.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerMemberRoutes } from "./routes/members.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerLedgerRoutes } from "./routes/ledger.js";
import { registerCoachRoutes } from "./routes/coaches.js";
import { registerAttendanceRoutes } from "./routes/attendance.js";
import { registerRoutineRoutes } from "./routes/routines.js";
import { registerMembershipRoutes } from "./routes/memberships.js";
import { registerInvitationRoutes } from "./routes/invitations.js";
import { registerAdminSecurityRoutes } from "./routes/admin-security.js";
import { registerInstitutionalSettingsRoutes } from "./routes/institutional-settings.js";
import { registerAdminRoleRoutes } from "./routes/admin-roles.js";
import { createHmac } from "node:crypto";

export interface AppDependencies {
  db?: Database;
  transactionalDb?: TransactionalDatabase;
}

export async function buildApp(
  config: AppConfig,
  dependencies: AppDependencies = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    // Confiar en los primeros N saltos de proxy (equivale al entero que acepta
    // el runtime de Fastify, que sus tipos no admiten): hop 0 es el mas cercano.
    trustProxy: config.trustProxyHops
      ? (_address: string, hop: number) => hop < config.trustProxyHops
      : false,
    bodyLimit: 1_048_576,
    requestTimeout: 15_000
  });

  await app.register(helmet, config.nodeEnv === "production" ? {} : {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      // Requests without Origin include server-to-server and health probes.
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    }
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // A database-backed fixed-window limiter is shared by all replicas. It only
  // covers sensitive endpoints; the plugin's local limits remain defense-in-depth.
  if (dependencies.db) {
    let rateLimitCleanupCounter = 0;
    app.addHook("onRequest", async (request, reply) => {
      const path = request.url.split("?")[0] ?? request.url;
      const policy = path === "/api/v1/auth/login" ? { max: 5, seconds: 60 }
        : path === "/api/v1/auth/password-reset/request" ? { max: 3, seconds: 3600 }
        : path === "/api/v1/auth/password-reset/confirm" ? { max: 5, seconds: 3600 }
        : path.startsWith("/api/v1/admin/invitations") ? { max: 10, seconds: 60 }
        : path.startsWith("/api/v1/admin/users/") && (path.endsWith("/reset-access") || path.endsWith("/sessions/revoke"))
          ? { max: 5, seconds: 60 }
          : null;
      if (!policy) return;
      reply.header("Cache-Control", "no-store");

      rateLimitCleanupCounter += 1;
      if (rateLimitCleanupCounter % 100 === 0) {
        await dependencies.db!.query("DELETE FROM rate_limit_buckets WHERE updated_at < now() - interval '24 hours'");
      }
      const routeKey = path
        .replace(/^\/api\/v1\/admin\/invitations\/[^/]+\/(resend|revoke)$/, "/api/v1/admin/invitations/:id/$1")
        .replace(/^\/api\/v1\/admin\/users\/[^/]+\/(reset-access|sessions\/revoke)$/, "/api/v1/admin/users/:id/$1");
      const identity = `${request.method}:${routeKey}:${request.ip}`;
      const key = createHmac("sha256", config.sessionSecret).update(identity).digest("hex");
      const result = await dependencies.db!.query<{ request_count: number } & Record<string, unknown>>(
        `INSERT INTO rate_limit_buckets (bucket_key, window_started_at, request_count, updated_at)
         VALUES ($1, clock_timestamp(), 1, clock_timestamp())
         ON CONFLICT (bucket_key) DO UPDATE SET
           request_count = CASE
             WHEN rate_limit_buckets.window_started_at <= clock_timestamp() - ($2 * interval '1 second') THEN 1
             ELSE rate_limit_buckets.request_count + 1
           END,
           window_started_at = CASE
             WHEN rate_limit_buckets.window_started_at <= clock_timestamp() - ($2 * interval '1 second') THEN clock_timestamp()
             ELSE rate_limit_buckets.window_started_at
           END,
           updated_at = clock_timestamp()
         RETURNING request_count`,
        [key, policy.seconds]
      );
      const count = Number(result.rows[0]?.request_count ?? 1);
      if (count > policy.max) {
        reply.header("Cache-Control", "no-store");
        reply.header("Retry-After", String(policy.seconds));
        return reply.code(429).send({
          error: "rate_limit_exceeded",
          message: "Too many requests. Please try again later."
        });
      }
    });
  }

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "ikigai-api",
    version: "v1"
  }));

  const appDb = dependencies.db ?? dependencies.transactionalDb;
  if (appDb) {
    registerAuthRoutes(app, appDb, config, dependencies.transactionalDb);
    registerMemberRoutes(app, appDb, config, dependencies.transactionalDb);
  }
  if (dependencies.transactionalDb) {
    registerBookingRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerLedgerRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerCoachRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerAttendanceRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerRoutineRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerMembershipRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerInvitationRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerAdminSecurityRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerInstitutionalSettingsRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
    registerAdminRoleRoutes(app, appDb ?? dependencies.transactionalDb, dependencies.transactionalDb, config);
  }

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found."
    });
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    const statusCode = error.message === "Origin not allowed"
      ? 403
      : error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "internal_error" : "request_error",
      message: statusCode === 500
        ? "An unexpected error occurred."
        : statusCode === 403
          ? "The request origin is not allowed."
          : error.message
    });
  });

  return app;
}
