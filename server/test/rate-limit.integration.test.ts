import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresDatabase } from "../src/db/postgres.js";
import { consumeSharedRateLimit } from "../src/security/rate-limit.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);

test("PostgreSQL rate limits are shared across independent API database clients", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const firstPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-rate-limit-instance-one-test"
  });
  const secondPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-rate-limit-instance-two-test"
  });
  const firstDb = new PostgresDatabase(firstPool);
  const secondDb = new PostgresDatabase(secondPool);
  const key = "integration-rate-limit:" + randomUUID();
  t.after(async () => {
    await firstPool.query("DELETE FROM auth_rate_limit_buckets WHERE bucket_key = $1", [key]);
    await Promise.all([firstPool.end(), secondPool.end()]);
  });

  const first = await consumeSharedRateLimit(firstDb, key, 2, 60);
  const second = await consumeSharedRateLimit(secondDb, key, 2, 60);
  const third = await consumeSharedRateLimit(firstDb, key, 2, 60);

  assert.deepEqual([first.allowed, first.hits], [true, 1]);
  assert.deepEqual([second.allowed, second.hits], [true, 2]);
  assert.deepEqual([third.allowed, third.hits], [false, 3]);
});
