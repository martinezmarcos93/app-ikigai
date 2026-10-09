import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export function csrfTokenFor(sessionToken: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionToken).digest("base64url");
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAllowedOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig
): boolean {
  const origin = request.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) return true;
  reply.code(403).send({
    error: "origin_not_allowed",
    message: "The request origin is not allowed."
  });
  return false;
}

export function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionToken: string,
  config: AppConfig
): boolean {
  if (!requireAllowedOrigin(request, reply, config)) return false;
  const supplied = request.headers["x-csrf-token"];
  const expected = csrfTokenFor(sessionToken, config.sessionSecret);
  if (typeof supplied === "string" && constantTimeStringEqual(supplied, expected)) return true;
  reply.code(403).send({
    error: "csrf_validation_failed",
    message: "The request could not be validated."
  });
  return false;
}
