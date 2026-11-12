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
  const tag = suffix.slice(0, 8);
  const admin = await createActor(pool, `Ranking Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Ranking Member ${suffix}`, "member");
  const other = await createActor(pool, `Ranking Other ${suffix}`, "member");
  const coach = await createActor(pool, `Ranking Coach ${suffix}`, "coach");

  // Ejercicio propio del test: así el ranking arranca vacío aunque la base ya tenga marcas de otras corridas.
  const code = `IT ${suffix.slice(0, 8).toUpperCase()}`;
  const exercise = await pool.query(
    "INSERT INTO strength_exercises (code, name, display_order) VALUES ($1, $2, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM strength_exercises)) RETURNING id",
    [code, `Ejercicio de prueba ${suffix}`]
  );
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
    payload: { memberId: member.memberId, exerciseId, weightKg: 60, notes: "Inicio", alias: `A ${tag}` }
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
    payload: { memberId: other.memberId, exerciseId, weightKg: 65, alias: `B ${tag}` }
  });
  assert.equal(otherRecord.statusCode, 201);

  const ranking = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(ranking.statusCode, 200);
  // As member, own member_id is visible, others are hidden
  assert.equal(Number(ranking.json().rankings[0].position), 1);
  assert.equal(Number(ranking.json().rankings[0].best_weight_kg), 70);
  assert.equal(String(ranking.json().rankings[0].member_id), member.memberId);

  assert.equal(Number(ranking.json().rankings[1].position), 2);
  assert.equal(Number(ranking.json().rankings[1].best_weight_kg), 65);
  assert.equal("member_id" in ranking.json().rankings[1], false);

  // As admin, all member_ids are visible
  const adminRanking = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: headers(admin),
  });
  assert.equal(adminRanking.statusCode, 200);
  assert.equal(Number(adminRanking.json().rankings[0].position), 1);
  assert.equal(Number(adminRanking.json().rankings[0].best_weight_kg), 70);
  assert.equal(String(adminRanking.json().rankings[0].member_id), member.memberId);

  assert.equal(Number(adminRanking.json().rankings[1].position), 2);
  assert.equal(Number(adminRanking.json().rankings[1].best_weight_kg), 65);
  assert.equal(String(adminRanking.json().rankings[1].member_id), other.memberId);
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

test("dominadas se miden en repeticiones enteras", {
  skip: !integrationEnabled
}, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Reps Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Reps Member ${suffix}`, "member");
  await pool.query("UPDATE member_profiles SET ranking_alias = $1 WHERE id = $2", [`Reps ${suffix.slice(0, 8)}`, member.memberId]);

  const pullUps = await pool.query("SELECT id, unit FROM strength_exercises WHERE code = 'DM'");
  assert.equal(pullUps.rows[0]?.unit, "reps");
  const exerciseId = String(pullUps.rows[0]?.id);

  const ranking = await app.inject({ method: "GET", url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`, headers: { cookie: `ikigai_session=${member.token}` } });
  assert.equal(ranking.statusCode, 200, ranking.body);
  assert.equal(ranking.json().exercise.unit, "reps");

  const decimal = await app.inject({ method: "POST", url: "/api/v1/admin/strength-records", headers: headers(admin), payload: { memberId: member.memberId, exerciseId, weightKg: 12.5 } });
  assert.equal(decimal.statusCode, 400, decimal.body);
  assert.equal(decimal.json().error, "invalid_strength_record");

  const tooMany = await app.inject({ method: "POST", url: "/api/v1/admin/strength-records", headers: headers(admin), payload: { memberId: member.memberId, exerciseId, weightKg: 1001 } });
  assert.equal(tooMany.statusCode, 400, tooMany.body);

  const ok = await app.inject({ method: "POST", url: "/api/v1/admin/strength-records", headers: headers(admin), payload: { memberId: member.memberId, exerciseId, weightKg: 12 } });
  assert.equal(ok.statusCode, 201, ok.body);
  const recordId = String(ok.json().record.id);

  const badFix = await app.inject({ method: "PATCH", url: `/api/v1/admin/strength-records/${recordId}`, headers: headers(admin), payload: { weightKg: 13.5 } });
  assert.equal(badFix.statusCode, 400, badFix.body);
  const goodFix = await app.inject({ method: "PATCH", url: `/api/v1/admin/strength-records/${recordId}`, headers: headers(admin), payload: { weightKg: 14 } });
  assert.equal(goodFix.statusCode, 200, goodFix.body);
  assert.equal(Number(goodFix.json().record.weight_kg), 14);

  const kgExercise = await pool.query("SELECT id FROM strength_exercises WHERE code = 'PP'");
  const kg = await app.inject({ method: "POST", url: "/api/v1/admin/strength-records", headers: headers(admin), payload: { memberId: member.memberId, exerciseId: String(kgExercise.rows[0]?.id), weightKg: 82.5 } });
  assert.equal(kg.statusCode, 201, kg.body);

  const history = await app.inject({ method: "GET", url: `/api/v1/admin/strength-records?exerciseId=${exerciseId}`, headers: headers(admin) });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal(history.json().records.find((r: { id: string }) => r.id === recordId)?.unit, "reps");

  await pool.query("DELETE FROM strength_records WHERE member_id = $1", [member.memberId]);
});
