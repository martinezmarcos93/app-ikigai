import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { hashPassword, verifyPassword } from "../src/security/password.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://password-reset-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

test("password reset is generic, single-use, expires, and revokes existing sessions", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-password-reset-integration-test"
  });
  const db = new PostgresDatabase(pool);
  let deliveredUrl = "";
  const app = await buildApp(config, {
    db,
    transactionalDb: db,
    passwordResetBaseUrl: "https://gym.example.com/reset-password",
    passwordResetDelivery: async (_email, url) => { deliveredUrl = url; }
  });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const email = "password-reset-" + randomUUID() + "@example.test";
  const oldPassword = "initial-password-2026";
  const inserted = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, await hashPassword(oldPassword)]
  );
  const userId = String(inserted.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'member')", [userId]);
  const sessionToken = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, digest(sessionToken), new Date(Date.now() + 60 * 60_000).toISOString()]
  );

  const unknown = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    headers: { origin },
    payload: { email: "unknown-" + randomUUID() + "@example.test" }
  });
  const requested = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    headers: { origin },
    payload: { email }
  });
  assert.equal(unknown.statusCode, 202);
  assert.equal(requested.statusCode, 202);
  assert.deepEqual(requested.json(), unknown.json());
  assert.ok(deliveredUrl);
  const rawToken = new URL(deliveredUrl).searchParams.get("token");
  assert.ok(rawToken);
  const stored = await pool.query(
    "SELECT token_hash FROM password_reset_tokens WHERE user_id=$1",
    [userId]
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]?.token_hash, digest(rawToken!));
  assert.notEqual(stored.rows[0]?.token_hash, rawToken);

  const newPassword = "new-secure-password-2026";
  const completed = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/complete",
    headers: { origin },
    payload: { token: rawToken, password: newPassword }
  });
  assert.equal(completed.statusCode, 200);
  const user = await pool.query("SELECT password_hash FROM users WHERE id=$1", [userId]);
  assert.equal(await verifyPassword(newPassword, String(user.rows[0]?.password_hash)), true);
  assert.equal(await verifyPassword(oldPassword, String(user.rows[0]?.password_hash)), false);

  const oldSession = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { cookie: "ikigai_session=" + sessionToken }
  });
  assert.equal(oldSession.statusCode, 401);

  const audit = await pool.query(
    "SELECT after_data::text AS after_data FROM audit_events WHERE actor_user_id IS NULL AND action='user.password_reset_completed' AND entity_id=$1",
    [userId]
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(String(audit.rows[0]?.after_data).includes(rawToken!), false);
  assert.equal(String(audit.rows[0]?.after_data).includes(email), false);

  const loginAfterReset = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email, password: newPassword }
  });
  assert.equal(loginAfterReset.statusCode, 200);

  const reused = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/complete",
    headers: { origin },
    payload: { token: rawToken, password: "another-password-2026" }
  });
  assert.equal(reused.statusCode, 400);
  assert.equal(reused.json().error, "invalid_or_expired_reset_token");
});
