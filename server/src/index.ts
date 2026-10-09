import "dotenv/config";
import pg from "pg";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { Database } from "./db.js";

const config = loadConfig();
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

if (pool) {
  await pool.query("SELECT 1");
}

const database: Database | undefined = pool
  ? {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = []
      ) {
        const result = await pool.query(sql, values);
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount
        };
      }
    }
  : undefined;

const app = await buildApp(config, database ? { db: database } : {});

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
