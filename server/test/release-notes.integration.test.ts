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
const origin = "https://release-notes-integration.example.com";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "integration-test-secret-with-more-than-32-characters" });

test("PostgreSQL release notes are dismissed once per account", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-test-placeholder-hash','local','active') RETURNING id",
    [`notes-it-${randomUUID()}@example.test`]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'coach')", [userId]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [
    userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()
  ]);
  const headers = { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) };

  const before = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers });
  assert.equal(before.statusCode, 200, before.body);
  assert.equal(before.json().releaseNotesSeen, null);

  const bad = await app.inject({ method: "POST", url: "/api/v1/auth/release-notes-seen", headers, payload: { version: "<script>" } });
  assert.equal(bad.statusCode, 400);
  const noCsrf = await app.inject({ method: "POST", url: "/api/v1/auth/release-notes-seen", headers: { origin, cookie: headers.cookie }, payload: { version: "2026-10-25" } });
  assert.equal(noCsrf.statusCode, 403);
  const seen = await app.inject({ method: "POST", url: "/api/v1/auth/release-notes-seen", headers, payload: { version: "2026-10-25" } });
  assert.equal(seen.statusCode, 204, seen.body);

  const after = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers });
  assert.equal(after.json().releaseNotesSeen, "2026-10-25");
});
