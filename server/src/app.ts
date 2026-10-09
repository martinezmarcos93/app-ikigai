import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { AppConfig } from "./config.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    bodyLimit: 1_048_576,
    requestTimeout: 15_000,
    disableRequestLogging: config.nodeEnv === "test"
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

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "ikigai-api",
    version: "v1"
  }));

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found."
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "internal_error" : "request_error",
      message: statusCode === 500 ? "An unexpected error occurred." : error.message
    });
  });

  return app;
}
