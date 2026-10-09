import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { hashPassword, verifyPassword } from "../src/security/password.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://gym.example.test";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "password-reset-test-secret-with-more-than-32-characters",
  PASSWORD_RESET_DELIVERY_URL: "https://delivery.example.test/send",
  PASSWORD_RESET_DELIVERY_TOKEN: "password-reset-delivery-test-token-with-32-plus",
  PASSWORD_RESET_PUBLIC_URL: `${origin}/reset-password`
});

test("password reset is generic, single-use, expires, invalidates previous tokens, and revokes sessions", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-password-reset-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  const originalFetch = globalThis.fetch;
  let resetUrl = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${config.passwordResetDeliveryToken}`);
    const payload = JSON.parse(String(init?.body)) as { to: string; resetUrl?: string; type: string };
    assert.ok(["ikigai.password_reset", "ikigai.password_reset_noop"].includes(payload.type));
    if (payload.type === "ikigai.password_reset") {
      assert.ok(payload.resetUrl);
      resetUrl = payload.resetUrl!;
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  t.after(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const email = `password-reset-${suffix}@example.test`;
  const initialPassword = await hashPassword("initial-test-password-2026");
  const userResult = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, initialPassword]
  );
  const userId = String(userResult.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'member')", [userId]);
  const sessionToken = randomUUID() + randomUUID();
  const sessionDigest = createHash("sha256").update(sessionToken).digest("hex");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
    [userId, sessionDigest]
  );

  const priorToken = randomUUID() + randomUUID();
  const priorDigest = createHash("sha256").update(priorToken).digest("hex");
  await pool.query(
    "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '30 minutes')",
    [userId, priorDigest]
  );

  const headers = { origin };
  const request = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    headers,
    payload: { email: email.toUpperCase() }
  });
  assert.equal(request.statusCode, 202);
  assert.equal(request.headers["cache-control"], "no-store");
  assert.match(request.json().message, /If an eligible account exists/);
  assert.ok(resetUrl);
  const token = new URL(resetUrl).searchParams.get("token");
  assert.ok(token);

  const stored = await pool.query(
    "SELECT token_hash,expires_at,used_at,revoked_at FROM password_reset_tokens WHERE user_id=$1",
    [userId]
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]?.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(stored.rows[0]?.token_hash, token);
  const prior = await pool.query("SELECT revoked_at FROM password_reset_tokens WHERE token_hash=$1", [priorDigest]);
  assert.ok(prior.rows[0]?.revoked_at);

  const newPassword = "new-secure-password-2026";
  const confirmed = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/confirm",
    headers,
    payload: { token, password: newPassword }
  });
  assert.equal(confirmed.statusCode, 204);

  const updated = await pool.query("SELECT password_hash FROM users WHERE id=$1", [userId]);
  assert.equal(await verifyPassword(newPassword, String(updated.rows[0]?.password_hash)), true);
  const session = await pool.query("SELECT revoked_at FROM sessions WHERE token_hash=$1", [sessionDigest]);
  assert.ok(session.rows[0]?.revoked_at);

  const replay = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/confirm",
    headers,
    payload: { token, password: "another-secure-password-2026" }
  });
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.json().error, "invalid_reset_token");

  const unknown = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    headers,
    payload: { email: `missing-${suffix}@example.test` }
  });
  assert.equal(unknown.statusCode, request.statusCode);
  assert.deepEqual(unknown.json(), request.json());

  const expiredToken = randomUUID() + randomUUID();
  const expiredDigest = createHash("sha256").update(expiredToken).digest("hex");
  await pool.query(
    "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,now()-interval '1 minute')",
    [userId, expiredDigest]
  );
  const expiredAttempt = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/confirm",
    headers,
    payload: { token: expiredToken, password: "expired-test-password-2026" }
  });
  assert.equal(expiredAttempt.statusCode, 400);
  assert.equal(expiredAttempt.json().error, "invalid_reset_token");
});


test("database-backed sensitive endpoint limits are shared across API replicas", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-shared-rate-limit-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const appA = await buildApp(config, { db, transactionalDb: db });
  const appB = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await appA.close();
    await appB.close();
    await pool.end();
  });

  const key = createHash("sha256").update("POST:/api/v1/auth/password-reset/request:127.0.0.1").digest("hex");
  await pool.query("DELETE FROM rate_limit_buckets WHERE bucket_key=$1", [key]);
  const payload = { email: `nonexistent-${randomUUID()}@example.test` };
  const send = (app: typeof appA) => app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    headers: { origin },
    payload
  });

  assert.equal((await send(appA)).statusCode, 202);
  assert.equal((await send(appB)).statusCode, 202);
  assert.equal((await send(appA)).statusCode, 202);
  const blocked = await send(appB);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["retry-after"], "3600");
  assert.equal(blocked.json().error, "rate_limit_exceeded");
});
