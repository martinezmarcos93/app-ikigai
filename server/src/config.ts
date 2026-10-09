export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  corsOrigins: string[];
  sessionSecret: string;
  passwordResetDeliveryUrl?: string;
  passwordResetDeliveryToken?: string;
  passwordResetPublicUrl?: string;
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

  if (rawEnv === "production" && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET must be explicitly configured with at least 32 characters in production.");
  }
  const sessionSecret = env.SESSION_SECRET ?? "development-only-session-secret-change-before-deploy";
  const passwordResetDeliveryUrl = env.PASSWORD_RESET_DELIVERY_URL?.trim();
  const passwordResetDeliveryToken = env.PASSWORD_RESET_DELIVERY_TOKEN;
  const passwordResetPublicUrl = env.PASSWORD_RESET_PUBLIC_URL?.trim();

  if (rawEnv === "production") {
    if (!passwordResetDeliveryUrl || !passwordResetDeliveryToken || !passwordResetPublicUrl) {
      throw new Error("PASSWORD_RESET_DELIVERY_URL, PASSWORD_RESET_DELIVERY_TOKEN, and PASSWORD_RESET_PUBLIC_URL must be configured in production.");
    }
    let delivery: URL;
    let publicUrl: URL;
    try {
      delivery = new URL(passwordResetDeliveryUrl);
      publicUrl = new URL(passwordResetPublicUrl);
    } catch {
      throw new Error("Password reset delivery and public URLs must be valid absolute URLs.");
    }
    if (delivery.protocol !== "https:" || publicUrl.protocol !== "https:") {
      throw new Error("Password reset delivery and public URLs must use HTTPS in production.");
    }
    if (passwordResetDeliveryToken.length < 32) {
      throw new Error("PASSWORD_RESET_DELIVERY_TOKEN must contain at least 32 characters in production.");
    }
    if (!corsOrigins.includes(publicUrl.origin)) {
      throw new Error("PASSWORD_RESET_PUBLIC_URL origin must be included in CORS_ORIGINS.");
    }
  }

  return {
    nodeEnv: rawEnv, host, port, corsOrigins, sessionSecret,
    ...(passwordResetDeliveryUrl ? { passwordResetDeliveryUrl } : {}),
    ...(passwordResetDeliveryToken ? { passwordResetDeliveryToken } : {}),
    ...(passwordResetPublicUrl ? { passwordResetPublicUrl } : {})
  };
}
