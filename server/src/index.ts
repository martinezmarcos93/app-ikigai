import "dotenv/config";
import pg from "pg";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresDatabase } from "./db/postgres.js";
import { validatePasswordResetConfig } from "./security/password-reset-config.js";

const config = loadConfig();
const passwordResetBaseUrl = process.env.PASSWORD_RESET_BASE_URL?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const passwordResetFrom = process.env.PASSWORD_RESET_FROM?.trim();

if (config.nodeEnv === "production") {
  validatePasswordResetConfig({
    baseUrl: passwordResetBaseUrl,
    apiKey: resendApiKey,
    from: passwordResetFrom,
    corsOrigins: config.corsOrigins
  });
}

const passwordResetDelivery = resendApiKey && passwordResetFrom
  ? async (email: string, resetUrl: string): Promise<void> => {
      const safeUrl = resetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const response = await fetch("https://api.resend.com/emails", {
        signal: AbortSignal.timeout(8_000),
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: passwordResetFrom,
          to: [email],
          subject: "Restablecer contraseña — Ikigai Training",
          text: `Solicitaste restablecer tu contraseña. Abrí este enlace antes de 30 minutos: ${resetUrl}. Si no lo solicitaste, ignorá este correo.`,
          html: `<p>Solicitaste restablecer tu contraseña de Ikigai Training.</p><p><a href="${safeUrl}">Crear una contraseña nueva</a></p><p>El enlace vence en 30 minutos. Si no lo solicitaste, ignorá este correo.</p>`
        })
      });
      if (!response.ok) {
        throw new Error(`Password reset email provider returned HTTP ${response.status}.`);
      }
    }
  : undefined;

const connectionString = process.env.DATABASE_URL;
if (config.nodeEnv === "production" && !connectionString) {
  throw new Error("DATABASE_URL is required in production.");
}

const pool = connectionString
  ? new pg.Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: "ikigai-api"
    })
  : undefined;

if (pool) await pool.query("SELECT 1");

const database = pool ? new PostgresDatabase(pool) : undefined;
const app = await buildApp(config, database ? {
  db: database,
  transactionalDb: database,
  passwordResetDelivery,
  passwordResetBaseUrl
} : { passwordResetDelivery, passwordResetBaseUrl });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "Could not start API server");
  await app.close();
  if (pool) await pool.end();
  process.exitCode = 1;
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down API server");
  await app.close();
  if (pool) await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
