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
const origin = "https://membership-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "member" | "admin") {
  const email = `membership-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email, password_hash, auth_provider, status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1,$2)", [userId, role]);
  const member = await pool.query(
    "INSERT INTO member_profiles (user_id, full_name, status) VALUES ($1,$2,'active') RETURNING id",
    [userId, name]
  );
  const memberId = String(member.rows[0]?.id);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return { userId, memberId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}

test("PostgreSQL membership lifecycle preserves agreed prices and audits termination", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-membership-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Membership Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Membership Member ${suffix}`, "member");
  const service = await pool.query(
    "INSERT INTO services (name, current_price, active) VALUES ($1, '40000.00', true) RETURNING id",
    [`Membership Service ${suffix}`]
  );
  const serviceId = String(service.rows[0]?.id);
  const startsOn = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10);
  const adminHeaders = {
    origin,
    cookie: `ikigai_session=${admin.token}`,
    "x-csrf-token": admin.csrfToken
  };
  const createPayload = {
    serviceId,
    startsOn,
    billingPeriod: "monthly",
    agreedPrice: "45000.00"
  };

  const created = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/memberships`,
    headers: adminHeaders,
    payload: createPayload
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().membership.agreed_price, "45000.00");
  const membershipId = String(created.json().membership.id);

  const replay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/memberships`,
    headers: adminHeaders,
    payload: createPayload
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().replayed, true);

  const forbidden = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/memberships`,
    headers: {
      origin,
      cookie: `ikigai_session=${member.token}`,
      "x-csrf-token": member.csrfToken
    },
    payload: createPayload
  });
  assert.equal(forbidden.statusCode, 403);

  const priceUpdate = await app.inject({
    method: "PATCH",
    url: `/api/v1/services/${serviceId}`,
    headers: adminHeaders,
    payload: { currentPrice: "50000.00" }
  });
  assert.equal(priceUpdate.statusCode, 200);
  assert.equal(priceUpdate.json().service.current_price, "50000.00");

  const historicalPrice = await pool.query(
    "SELECT agreed_price::numeric(12,2)::text AS agreed_price FROM memberships WHERE id=$1",
    [membershipId]
  );
  assert.equal(historicalPrice.rows[0]?.agreed_price, "45000.00");

  const ended = await app.inject({
    method: "POST",
    url: `/api/v1/memberships/${membershipId}/end`,
    headers: adminHeaders,
    payload: { endedOn: startsOn }
  });
  assert.equal(ended.statusCode, 200);
  assert.equal(ended.json().membership.status, "ended");
  assert.equal(ended.json().membership.ends_on, startsOn);

  const endReplay = await app.inject({
    method: "POST",
    url: `/api/v1/memberships/${membershipId}/end`,
    headers: adminHeaders,
    payload: { endedOn: startsOn }
  });
  assert.equal(endReplay.statusCode, 200);
  assert.equal(endReplay.json().replayed, true);

  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_type='membership' AND entity_id=$1 ORDER BY action",
    [membershipId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ["membership.created", "membership.ended"]);
});
