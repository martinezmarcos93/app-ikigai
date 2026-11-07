import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://strength-ranking-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "admin" | "member" | "coach") {
  const email = `strength-ranking-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  const profile = role === "coach"
    ? await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline) VALUES ($1,$2,'Funcional') RETURNING id", [userId, name])
    : await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, name]);
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
  return { origin, cookie: `ikigai_session=${actor.token}`, "x-csrf-token": actor.csrfToken };
}

test("strength rankings are readable by authenticated roles and writable only by admin", {
  skip: !integrationEnabled
}, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Ranking Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Ranking Member ${suffix}`, "member");
  const other = await createActor(pool, `Ranking Other ${suffix}`, "member");
  const coach = await createActor(pool, `Ranking Coach ${suffix}`, "coach");

  const exercise = await pool.query("SELECT id FROM strength_exercises WHERE code='PP'");
  assert.ok(exercise.rows[0]);
  const exerciseId = String(exercise.rows[0].id);

  const memberRead = await app.inject({ method: "GET", url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`, headers: { cookie: `ikigai_session=${member.token}` } });
  assert.equal(memberRead.statusCode, 200, memberRead.body);
  assert.equal(memberRead.json().rankings.length, 0);

  const coachRead = await app.inject({ method: "GET", url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`, headers: { cookie: `ikigai_session=${coach.token}` } });
  assert.equal(coachRead.statusCode, 200);

  const memberWrite = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(member),
    payload: { memberId: member.memberId, exerciseId, weightKg: 60 }
  });
  assert.equal(memberWrite.statusCode, 403);

  const first = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member.memberId, exerciseId, weightKg: 60, notes: "Inicio" }
  });
  assert.equal(first.statusCode, 201, first.body);

  const second = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member.memberId, exerciseId, weightKg: 70 }
  });
  assert.equal(second.statusCode, 201, second.body);

  const otherRecord = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: other.memberId, exerciseId, weightKg: 65 }
  });
  assert.equal(otherRecord.statusCode, 201);

  const ranking = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(ranking.statusCode, 200);
  assert.deepEqual(
    ranking.json().rankings.map((item: { member_id: string; position: number; best_weight_kg: string }) => [item.member_id, Number(item.position), Number(item.best_weight_kg)]),
    [[member.memberId, 1, 70], [other.memberId, 2, 65]]
  );
  assert.equal(String(ranking.json().me.member_id), member.memberId);
  assert.equal(Number(ranking.json().me.best_weight_kg), 70);

  const records = await app.inject({
    method: "GET",
    url: `/api/v1/admin/strength-records?exerciseId=${exerciseId}`,
    headers: headers(admin)
  });
  assert.equal(records.statusCode, 200);
  assert.equal(records.json().records.length, 3);

  const recordId = String(second.json().record.id);
  const update = await app.inject({
    method: "PATCH",
    url: `/api/v1/admin/strength-records/${recordId}`,
    headers: headers(admin),
    payload: { weightKg: 72 }
  });
  assert.equal(update.statusCode, 200);

  const remove = await app.inject({
    method: "DELETE",
    url: `/api/v1/admin/strength-records/${recordId}`,
    headers: headers(admin),
    payload: {}
  });
  assert.equal(remove.statusCode, 200);

  const rankingAfterDelete = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(rankingAfterDelete.statusCode, 200);
  assert.equal(Number(rankingAfterDelete.json().me.best_weight_kg), 60);
  assert.equal(Number(rankingAfterDelete.json().me.position), 2);

  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_type='strength_record' AND actor_user_id=$1 ORDER BY occurred_at",
    [admin.userId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), [
    "strength_record.created",
    "strength_record.created",
    "strength_record.created",
    "strength_record.corrected",
    "strength_record.deleted"
  ]);
});
