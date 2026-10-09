import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://admin-security-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, role: "admin" | "member") {
  const email = `admin-security-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active')", [userId, role]);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return { userId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}

test("administrator can revoke another user's sessions and the operation is idempotent", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-admin-security-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const admin = await createActor(pool, "admin");
  const target = await createActor(pool, "member");
  const adminHeaders = {
    origin,
    cookie: `ikigai_session=${admin.token}`,
    "x-csrf-token": admin.csrfToken
  };

  const denied = await app.inject({
    method: "POST",
    url: `/api/v1/admin/users/${target.userId}/sessions/revoke`,
    headers: {
      origin,
      cookie: `ikigai_session=${target.token}`,
      "x-csrf-token": target.csrfToken
    }
  });
  assert.equal(denied.statusCode, 403);

  const revoked = await app.inject({
    method: "POST",
    url: `/api/v1/admin/users/${target.userId}/sessions/revoke`,
    headers: adminHeaders
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.json().revokedSessions, 1);
  assert.equal(revoked.json().replayed, false);

  const targetMe = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { cookie: `ikigai_session=${target.token}` }
  });
  assert.equal(targetMe.statusCode, 401);

  const replay = await app.inject({
    method: "POST",
    url: `/api/v1/admin/users/${target.userId}/sessions/revoke`,
    headers: adminHeaders
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().revokedSessions, 0);
  assert.equal(replay.json().replayed, true);

  const audit = await pool.query(
    "SELECT count(*)::int AS total FROM audit_events WHERE action='user.sessions_revoked' AND entity_id=$1",
    [target.userId]
  );
  assert.equal(audit.rows[0]?.total, 1);
});
