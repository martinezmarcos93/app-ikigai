import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://rate-limit-integration.example.test";
const clientIp = "198.51.100.77";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "rate-limit-integration-secret-with-more-than-32-characters",
  TRUST_PROXY_HOPS: "1"
});

test("shared PostgreSQL rate limit is enforced across two API instances", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const firstPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-shared-rate-limit-instance-one-test"
  });
  const secondPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-shared-rate-limit-instance-two-test"
  });
  const firstDb = new PostgresDatabase(firstPool);
  const secondDb = new PostgresDatabase(secondPool);
  const key = createHmac("sha256", config.sessionSecret)
    .update(`POST:/api/v1/auth/login:${clientIp}`)
    .digest("hex");
  await firstPool.query("DELETE FROM rate_limit_buckets WHERE bucket_key = $1", [key]);
  const firstApp = await buildApp(config, { db: firstDb, transactionalDb: firstDb });
  const secondApp = await buildApp(config, { db: secondDb, transactionalDb: secondDb });
  t.after(async () => {
    await Promise.all([firstApp.close(), secondApp.close()]);
    await firstPool.query("DELETE FROM rate_limit_buckets WHERE bucket_key = $1", [key]);
    await Promise.all([firstPool.end(), secondPool.end()]);
  });

  const attempt = () => ({
    method: "POST" as const,
    url: "/api/v1/auth/login",
    headers: { origin, "x-forwarded-for": clientIp },
    payload: { email: "no-account-rate-limit@example.test", password: "wrong-password-for-rate-limit-2026" }
  });
  for (let i = 0; i < 3; i += 1) {
    const response = await firstApp.inject(attempt());
    assert.equal(response.statusCode, 401);
  }
  for (let i = 0; i < 2; i += 1) {
    const response = await secondApp.inject(attempt());
    assert.equal(response.statusCode, 401);
  }
  const blocked = await secondApp.inject(attempt());
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error, "too_many_attempts");
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
});
