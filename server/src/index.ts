import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "Could not start API server");
  await app.close();
  process.exitCode = 1;
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down API server");
  await app.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
