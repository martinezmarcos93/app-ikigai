import pg from "pg";
import { assertNoLocalEnvFileInProduction, loadConfig } from "./config.js";
import { buildApp } from "./app.js";

const { Pool } = pg;
const config = loadConfig();
assertNoLocalEnvFileInProduction(process.cwd(), config.nodeEnv);
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  // Never log connection strings or credentials.
  console.error("Unexpected idle PostgreSQL client error", error.message);
});

const app = buildApp({ pool, config });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down API");
  try {
    await app.close();
    await pool.end();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  await pool.end();
  process.exitCode = 1;
}