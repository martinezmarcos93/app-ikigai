import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const enabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://game-v2-integration.example.com";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "integration-test-secret-with-more-than-32-characters" });

test("PostgreSQL game V2 contract, rejection, and V1 ranking exclusion", { skip: !enabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });
  const user = await pool.query("INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-placeholder','local','active') RETURNING id", [`game-v2-${randomUUID()}@example.test`]);
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'member')", [userId]);
  const member = await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,'Miembro Prueba','active') RETURNING id", [userId]);
  const memberId = String(member.rows[0]?.id);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  const headers = { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) };

  async function start(ageSeconds: number) {
    const started = await app.inject({ method: "POST", url: "/api/v1/game/runs", headers });
    assert.equal(started.statusCode, 201, started.body);
    const id = String(started.json().run.id);
    await pool.query("UPDATE game_runs SET started_at = clock_timestamp() - make_interval(secs => $2) WHERE id = $1", [id, ageSeconds]);
    return id;
  }
  const validRun = await start(140);
  const valid = await app.inject({ method: "POST", url: `/api/v1/game/runs/${validRun}/finish`, headers, payload: { version: 2, weight: "light", exercises: { bench: "PPP", pull: "", curl: "", bike: "" } } });
  assert.equal(valid.statusCode, 200, valid.body);
  assert.equal(valid.json().score, 87);
  assert.equal(valid.json().pointsAwarded, 87);
  const stored = await pool.query("SELECT game_version, weight, detail FROM game_runs WHERE id = $1", [validRun]);
  assert.equal(stored.rows[0]?.game_version, 2);
  assert.equal(stored.rows[0]?.weight, "light");
  assert.deepEqual(stored.rows[0]?.detail, { bench: "PPP", pull: "", curl: "", bike: "" });

  const legacyRun = await start(140);
  const legacy = await app.inject({ method: "POST", url: `/api/v1/game/runs/${legacyRun}/finish`, headers, payload: { reps: 1, perfectReps: 0 } });
  assert.equal(legacy.statusCode, 409);
  assert.equal(legacy.json().error, "outdated_client");
  const fastRun = await start(30);
  const fast = await app.inject({ method: "POST", url: `/api/v1/game/runs/${fastRun}/finish`, headers, payload: { version: 2, weight: "light", exercises: { bench: "", pull: "", curl: "", bike: "" } } });
  assert.equal(fast.statusCode, 422);
  assert.equal(fast.json().reason, "too_fast");

  await pool.query("INSERT INTO game_runs (user_id,member_id,status,started_at,finished_at,reps,perfect_reps,score) VALUES ($1,$2,'finished',now()-interval '2 days',now()-interval '2 days',100,32,99999)", [userId, memberId]);
  const summary = await app.inject({ method: "GET", url: "/api/v1/game/summary", headers });
  assert.equal(summary.statusCode, 200, summary.body);
  assert.equal(summary.json().me.personalBest, 87);
  assert.ok(!summary.json().week.ranking.some((row: { score: number }) => row.score === 99999));
});
