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

export interface AppDependencies {
  db?: Database;
  transactionalDb?: TransactionalDatabase;
  passwordResetDelivery?: (email: string, resetUrl: string) => Promise<void>;
  passwordResetBaseUrl?: string;
}

export async function buildApp(
  config: AppConfig,
  dependencies: AppDependencies = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
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

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "ikigai-api",
    version: "v1"
  }));

  const appDb = dependencies.db ?? dependencies.transactionalDb;
  if (appDb) {
    registerAuthRoutes(app, appDb, config, dependencies.transactionalDb, dependencies.passwordResetDelivery, dependencies.passwordResetBaseUrl);
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
