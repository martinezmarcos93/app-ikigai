import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  appOrigin: string;
  databaseUrl: string;
  databaseSsl: boolean;
  sessionTtlHours: number;
  sessionPepper: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const sessionTtlHours = Number(env.SESSION_TTL_HOURS ?? 12);
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 168) {
    throw new Error("SESSION_TTL_HOURS must be an integer between 1 and 168");
  }

  const sessionPepper = env.SESSION_PEPPER ?? "";
  if (nodeEnv === "production" && sessionPepper.length < 32) {
    throw new Error("SESSION_PEPPER must contain at least 32 characters in production");
  }
  if (nodeEnv !== "test" && sessionPepper.length > 0 && sessionPepper.length < 32) {
    throw new Error("SESSION_PEPPER must be empty or contain at least 32 characters");
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  if (nodeEnv !== "test" && !databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const appOrigin = env.APP_ORIGIN ?? "http://127.0.0.1:3001";
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(appOrigin);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute URL");
  }
  if (nodeEnv === "production" && parsedOrigin.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }

  return {
    nodeEnv: nodeEnv as RuntimeConfig["nodeEnv"],
    host: env.HOST ?? "127.0.0.1",
    port,
    appOrigin: parsedOrigin.origin,
    databaseUrl,
    databaseSsl: env.DATABASE_SSL === "true",
    sessionTtlHours,
    sessionPepper,
  };
}

export function assertNoLocalEnvFileInProduction(cwd = process.cwd(), nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === "production" && existsSync(resolve(cwd, ".env"))) {
    throw new Error("Do not load a local .env file in production; inject secrets through the hosting environment");
  }
}