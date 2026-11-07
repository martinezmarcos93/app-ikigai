import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://strength-ranking-alias-it.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "admin" | "member" | "coach") {
  const email = `strength-alias-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  const profile = await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, name]);
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

test("ranking alias integration tests", {
  skip: !integrationEnabled
}, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Admin ${suffix}`, "admin");
  const member1 = await createActor(pool, `Member 1 ${suffix}`, "member");
  const member2 = await createActor(pool, `Member 2 ${suffix}`, "member");

  const exercise = await pool.query(
    "INSERT INTO strength_exercises (code, name, display_order) VALUES ($1, $2, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM strength_exercises)) RETURNING id",
    [`IT-${suffix.slice(0, 4).toUpperCase()}`, `Exercise ${suffix}`]
  );
  const exerciseId = String(exercise.rows[0].id);

  // 1. crear marca sin apodo para un miembro sin apodo → 400 alias_required
  const badReq = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member1.memberId, exerciseId, weightKg: 10 }
  });
  assert.equal(badReq.statusCode, 400);
  assert.equal(badReq.json().error, "alias_required");

  // 2. con apodo → 201 y una segunda marca sin alias → 201 (reutiliza)
  const okReq1 = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member1.memberId, exerciseId, weightKg: 10, alias: "Toro" }
  });
  assert.equal(okReq1.statusCode, 201);

  const okReq2 = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member1.memberId, exerciseId, weightKg: 20 }
  });
  assert.equal(okReq2.statusCode, 201);

  // 3. otro miembro con el mismo apodo → 409 alias_taken
  const failReq = await app.inject({
    method: "POST",
    url: "/api/v1/admin/strength-records",
    headers: headers(admin),
    payload: { memberId: member2.memberId, exerciseId, weightKg: 10, alias: "toro" }
  });
  assert.equal(failReq.statusCode, 409);
  assert.equal(failReq.json().error, "alias_taken");

  // 4. lectura como miembro: ninguna fila tiene member_name, la ajena no tiene member_id, display_name es el apodo
  const readMember = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: { cookie: `ikigai_session=${member1.token}` }
  });
  assert.equal(readMember.statusCode, 200);
  const rankings = readMember.json().rankings;
  assert.equal(rankings[0].display_name, "Toro");
  assert.ok(!("member_name" in rankings[0]));
  assert.ok("member_id" in rankings[0]); // el propio

  // 5. lectura como admin: trae member_name
  const readAdmin = await app.inject({
    method: "GET",
    url: `/api/v1/strength-rankings?exerciseId=${exerciseId}`,
    headers: { cookie: `ikigai_session=${admin.token}` }
  });
  assert.equal(readAdmin.statusCode, 200);
  assert.ok("member_name" in readAdmin.json().rankings[0]);

  // 6. PUT del apodo como miembro → 403; como admin → 200
  const putMember = await app.inject({
    method: "PUT",
    url: `/api/v1/admin/strength-aliases/${member1.memberId}`,
    headers: headers(member1),
    payload: { alias: "Nuevo" }
  });
  assert.equal(putMember.statusCode, 403);

  const putAdmin = await app.inject({
    method: "PUT",
    url: `/api/v1/admin/strength-aliases/${member1.memberId}`,
    headers: headers(admin),
    payload: { alias: "Nuevo" }
  });
  assert.equal(putAdmin.statusCode, 200);

  // 7. ranking de Iron Pixel: name sea el apodo
  await pool.query("INSERT INTO game_runs (user_id, member_id, status, finished_at, score, points_awarded) VALUES ($1, $2, 'finished', now(), 100, 10)", [member1.userId, member1.memberId]);
  const gameSummary = await app.inject({
    method: "GET",
    url: "/api/v1/game/summary",
    headers: { cookie: `ikigai_session=${member1.token}` }
  });
  assert.equal(gameSummary.statusCode, 200);
  assert.equal(gameSummary.json().week.ranking[0].name, "Nuevo");
});
