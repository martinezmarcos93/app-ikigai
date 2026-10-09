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
const origin = "https://financial-rules-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "admin" | "member") {
  const email = `financial-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  const profile = await pool.query(
    "INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id",
    [userId, name]
  );
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return {
    userId,
    memberId: String(profile.rows[0]?.id),
    token,
    csrfToken: csrfTokenFor(token, config.sessionSecret)
  };
}

function headers(actor: { token: string; csrfToken: string }) {
  return {
    origin,
    cookie: `ikigai_session=${actor.token}`,
    "x-csrf-token": actor.csrfToken
  };
}

test("PostgreSQL ledger is scoped, idempotent, and calculates balances without duplicate movements", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-ledger-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Ledger Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Ledger Member ${suffix}`, "member");
  const other = await createActor(pool, `Other Member ${suffix}`, "member");
  const charge = {
    type: "charge",
    amount: "50000.00",
    description: "Cuota mensual de prueba",
    occurred_on: "2026-11-01",
    applied_period: "2026-11-01"
  };
  const first = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { ...headers(admin), "idempotency-key": "ledger-charge-0001" },
    payload: charge
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().balance, "50000.00");

  const replay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { ...headers(admin), "idempotency-key": "ledger-charge-0001" },
    payload: charge
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().balance, "50000.00");

  const conflict = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { ...headers(admin), "idempotency-key": "ledger-charge-0001" },
    payload: { ...charge, amount: "60000.00" }
  });
  assert.equal(conflict.statusCode, 409);

  const payment = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { ...headers(admin), "idempotency-key": "ledger-payment-0001" },
    payload: {
      type: "payment",
      amount: "15000.00",
      description: "Pago parcial de prueba",
      occurred_on: "2026-11-05",
      applied_period: "2026-11-01",
      payment_method: "transfer"
    }
  });
  assert.equal(payment.statusCode, 201);
  assert.equal(payment.json().balance, "35000.00");
  assert.equal(payment.json().receiptType, "internal");

  const memberRead = await app.inject({
    method: "GET",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(memberRead.statusCode, 200);
  assert.equal(memberRead.json().total, 2);
  assert.equal(memberRead.json().balance, "35000.00");

  const crossMemberRead = await app.inject({
    method: "GET",
    url: `/api/v1/members/${other.memberId}/ledger-entries`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(crossMemberRead.statusCode, 404);

  const memberWrite = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/ledger-entries`,
    headers: { ...headers(member), "idempotency-key": "member-write-0001" },
    payload: charge
  });
  assert.equal(memberWrite.statusCode, 403);

  const audit = await pool.query(
    "SELECT count(*)::int AS total FROM audit_events WHERE action='ledger.entry_created' AND entity_type='ledger_entry' AND after_data->>'memberId'=$1",
    [member.memberId]
  );
  assert.equal(audit.rows[0]?.total, 2);
});

test("PostgreSQL coach obligations use fixed monthly amounts and idempotent partial payments", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-coach-finance-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const admin = await createActor(pool, `Coach Finance Admin ${randomUUID()}`, "admin");
  const createdCoach = await app.inject({
    method: "POST",
    url: "/api/v1/coaches",
    headers: headers(admin),
    payload: { full_name: `Coach ${randomUUID()}`, discipline: "Kick Boxing" }
  });
  assert.equal(createdCoach.statusCode, 201);
  const coachId = String(createdCoach.json().coach.id);

  const obligationPayload = { period: "2026-11", agreed_amount: "100000.00", due_on: "2026-11-10" };
  const obligation = await app.inject({
    method: "POST",
    url: `/api/v1/coaches/${coachId}/obligations`,
    headers: headers(admin),
    payload: obligationPayload
  });
  assert.equal(obligation.statusCode, 201);
  assert.equal(obligation.json().summary.balance, "100000.00");
  const obligationId = String(obligation.json().obligation.id);

  const obligationReplay = await app.inject({
    method: "POST",
    url: `/api/v1/coaches/${coachId}/obligations`,
    headers: headers(admin),
    payload: obligationPayload
  });
  assert.equal(obligationReplay.statusCode, 200);
  assert.equal(obligationReplay.json().replayed, true);

  const paymentPayload = { amount: "25000.00", paid_on: "2026-11-05", payment_method: "transfer" };
  const payment = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/payments`,
    headers: { ...headers(admin), "idempotency-key": "coach-payment-0001" },
    payload: paymentPayload
  });
  assert.equal(payment.statusCode, 201);
  assert.equal(payment.json().summary.balance, "75000.00");

  const paymentReplay = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/payments`,
    headers: { ...headers(admin), "idempotency-key": "coach-payment-0001" },
    payload: paymentPayload
  });
  assert.equal(paymentReplay.statusCode, 200);
  assert.equal(paymentReplay.json().summary.balance, "75000.00");

  const adjustment = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/adjustments`,
    headers: { ...headers(admin), "idempotency-key": "coach-adjust-0001" },
    payload: { amount_delta: "-5000.00", reason: "Bonificación acordada" }
  });
  assert.equal(adjustment.statusCode, 201);
  assert.equal(adjustment.json().summary.balance, "70000.00");

  const adjustmentConflict = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/adjustments`,
    headers: { ...headers(admin), "idempotency-key": "coach-adjust-0001" },
    payload: { amount_delta: "-5000.00", reason: "Motivo distinto" }
  });
  assert.equal(adjustmentConflict.statusCode, 409);

  const summary = await app.inject({
    method: "GET",
    url: `/api/v1/coaches/${coachId}/obligations?period=2026-11`,
    headers: { cookie: `ikigai_session=${admin.token}` }
  });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().configured, true);
  assert.equal(summary.json().paid, "25000.00");
  assert.equal(summary.json().adjustmentTotal, "-5000.00");
  assert.equal(summary.json().balance, "70000.00");
});
