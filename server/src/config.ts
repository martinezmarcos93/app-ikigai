export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  corsOrigins: string[];
  sessionSecret: string;
}

export type EnvironmentSource = Record<string, string | undefined>;

export function loadConfig(env: EnvironmentSource = process.env): AppConfig {
  const rawEnv = env.NODE_ENV ?? "development";
  if (rawEnv !== "development" && rawEnv !== "test" && rawEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const host = (env.HOST ?? "127.0.0.1").trim();
  if (!host) throw new Error("HOST must not be empty.");

  const rawOrigins = env.CORS_ORIGINS;
  if (rawEnv === "production" && !rawOrigins?.trim()) {
    throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  }

  const corsOrigins = (rawOrigins ?? (rawEnv === "production" ? "" : "http://localhost:8000,http://127.0.0.1:8000"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of corsOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS origins must be exact HTTP(S) origins without paths: ${origin}`);
    }
  }

  const sessionSecret = env.SESSION_SECRET ?? "development-only-session-secret-change-before-deploy";
  if (rawEnv === "production" && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
  }

  return { nodeEnv: rawEnv, host, port, corsOrigins, sessionSecret };
}
