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
const origin = "https://game-integration.example.com";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "integration-test-secret-with-more-than-32-characters" });

type Role = "admin" | "member" | "coach";
async function createActor(pool: pg.Pool, name: string, roles: Role[]) {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-test-placeholder-hash','local','active') RETURNING id",
    [`game-it-${randomUUID()}@example.test`]
  );
  const userId = String(user.rows[0]?.id);
  for (const role of roles) await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let memberId: string | null = null;
  if (roles.includes("member")) {
    const profile = await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, name]);
    memberId = String(profile.rows[0]?.id);
  }
  if (roles.includes("coach")) await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline) VALUES ($1,$2,'Funcional')", [userId, name]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [
    userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()
  ]);
  return { userId, memberId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}
const headers = (a: { token: string; csrfToken: string }) => ({ origin, cookie: `ikigai_session=${a.token}`, "x-csrf-token": a.csrfToken });

test("PostgreSQL game: score validated by the server, points capped per day, redemption and weekly prize", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  // Base compartida con otros tests: este test deja la configuración y las semanas como las encontró.
  await pool.query("UPDATE reward_settings SET points_per_reward = 5000, daily_points_cap = 1000 WHERE id = true");
  const suffix = randomUUID().slice(0, 8);
  const admin = await createActor(pool, `Admin ${suffix}`, ["admin"]);
  const coach = await createActor(pool, `Profe ${suffix}`, ["coach"]);
  const ana = await createActor(pool, `Ana Zeta${suffix}`, ["member"]);

  async function play(actor: typeof ana, reps: number, perfectReps: number, ageSeconds = 31) {
    const started = await app.inject({ method: "POST", url: "/api/v1/game/runs", headers: headers(actor) });
    assert.equal(started.statusCode, 201, started.body);
    const runId = String(started.json().run.id);
    // Simula que pasaron los 30 segundos de juego.
    await pool.query("UPDATE game_runs SET started_at = clock_timestamp() - make_interval(secs => $2) WHERE id = $1", [runId, ageSeconds]);
    return app.inject({ method: "POST", url: `/api/v1/game/runs/${runId}/finish`, headers: headers(actor), payload: { reps, perfectReps } });
  }

  // Una partida normal acredita el puntaje como puntos.
  const first = await play(ana, 40, 10);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().score, 500);
  assert.equal(first.json().pointsAwarded, 500);
  assert.equal(first.json().balance, 500);

  // El tope diario recorta: 500 + 700 → solo 500 más.
  const second = await play(ana, 50, 20);
  assert.equal(second.json().score, 700);
  assert.equal(second.json().pointsAwarded, 500);
  assert.equal(second.json().balance, 1000);
  const third = await play(ana, 30, 0);
  assert.equal(third.json().pointsAwarded, 0);

  // Partidas imposibles: se rechazan y no suman nada.
  const tooFast = await play(ana, 20, 0, 5);
  assert.equal(tooFast.statusCode, 422);
  assert.equal(tooFast.json().reason, "too_fast");
  const spam = await play(ana, 500, 0);
  assert.equal(spam.statusCode, 422);
  assert.equal(spam.json().reason, "implausible_reps");

  // Una partida no se puede cerrar dos veces ni la cierra otra persona.
  const started = await app.inject({ method: "POST", url: "/api/v1/game/runs", headers: headers(ana) });
  const runId = String(started.json().run.id);
  const foreign = await app.inject({ method: "POST", url: `/api/v1/game/runs/${runId}/finish`, headers: headers(coach), payload: { reps: 1, perfectReps: 0 } });
  assert.equal(foreign.statusCode, 404);
  await pool.query("UPDATE game_runs SET started_at = clock_timestamp() - interval '31 seconds' WHERE id = $1", [runId]);
  const once = await app.inject({ method: "POST", url: `/api/v1/game/runs/${runId}/finish`, headers: headers(ana), payload: { reps: 1, perfectReps: 0 } });
  assert.equal(once.statusCode, 200);
  const twice = await app.inject({ method: "POST", url: `/api/v1/game/runs/${runId}/finish`, headers: headers(ana), payload: { reps: 1, perfectReps: 0 } });
  assert.equal(twice.statusCode, 409);

  // El profe juega pero no suma puntos canjeables ni entra al ranking.
  const coachRun = await play(coach, 60, 30);
  assert.equal(coachRun.statusCode, 200);
  assert.equal(coachRun.json().score, 900);
  assert.equal(coachRun.json().competes, false);
  assert.equal(coachRun.json().balance, null);

  const summary = await app.inject({ method: "GET", url: "/api/v1/game/summary", headers: headers(ana) });
  assert.equal(summary.statusCode, 200, summary.body);
  const body = summary.json();
  assert.equal(body.competes, true);
  assert.equal(body.me.balance, 1000);
  assert.equal(body.me.personalBest, 700);
  const mine = body.week.ranking.find((r: { me: boolean }) => r.me);
  assert.ok(mine, "Ana figura en el ranking");
  assert.equal(mine.name, `Ana Z.`);
  assert.equal(mine.score, 700);
  const coachSummary = await app.inject({ method: "GET", url: "/api/v1/game/summary", headers: headers(coach) });
  assert.equal(coachSummary.json().competes, false);
  assert.equal(coachSummary.json().me.personalBest, 900);
  assert.ok(!coachSummary.json().week.ranking.some((r: { me: boolean }) => r.me));

  // Canje: solo administración, con saldo suficiente y sin doble toque.
  const notEnough = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/redeem", headers: headers(admin), payload: { memberId: ana.memberId, expectedBalance: 1000 } });
  assert.equal(notEnough.statusCode, 409);
  assert.equal(notEnough.json().error, "insufficient_points");
  await pool.query("INSERT INTO reward_points (member_id, delta, kind, note, created_by) VALUES ($1, 4500, 'adjustment', 'test', $2)", [ana.memberId, admin.userId]);
  const byMember = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/redeem", headers: headers(ana), payload: { memberId: ana.memberId, expectedBalance: 5500 } });
  assert.equal(byMember.statusCode, 403);
  const redeemed = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/redeem", headers: headers(admin), payload: { memberId: ana.memberId, expectedBalance: 5500 } });
  assert.equal(redeemed.statusCode, 201, redeemed.body);
  assert.equal(redeemed.json().balance, 500);
  const doubleTap = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/redeem", headers: headers(admin), payload: { memberId: ana.memberId, expectedBalance: 5500 } });
  assert.equal(doubleTap.statusCode, 409);
  assert.equal(doubleTap.json().error, "balance_changed");
  await assert.rejects(pool.query("DELETE FROM reward_points WHERE member_id = $1", [ana.memberId]), /append-only/);

  // Premio semanal: solo semanas cerradas, ganador calculado por el servidor, una sola entrega.
  const current = await app.inject({ method: "GET", url: "/api/v1/game/summary", headers: headers(ana) });
  const thisWeek = String(current.json().week.start);
  const notClosed = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/weekly-prizes", headers: headers(admin), payload: { weekStart: thisWeek } });
  assert.equal(notClosed.statusCode, 409);
  assert.equal(notClosed.json().error, "week_not_closed");
  // Semana de prueba lejana en el pasado (lunes), con una partida de Ana adentro.
  const pastWeek = "2001-01-01";
  await pool.query("DELETE FROM weekly_prizes WHERE week_start = $1", [pastWeek]);
  await pool.query(
    `INSERT INTO game_runs (user_id, member_id, status, started_at, finished_at, reps, perfect_reps, score)
     VALUES ($1, $2, 'finished', '2001-01-03 15:00-03', '2001-01-03 15:00:31-03', 99, 30, 99999)`,
    [ana.userId, ana.memberId]
  );
  const prize = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/weekly-prizes", headers: headers(admin), payload: { weekStart: pastWeek } });
  assert.equal(prize.statusCode, 201, prize.body);
  assert.equal(prize.json().winner.score, 99999);
  const again = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/weekly-prizes", headers: headers(admin), payload: { weekStart: pastWeek } });
  assert.equal(again.statusCode, 409);
  const tuesday = await app.inject({ method: "POST", url: "/api/v1/admin/rewards/weekly-prizes", headers: headers(admin), payload: { weekStart: "2001-01-02" } });
  assert.equal(tuesday.statusCode, 400);

  // Configuración: solo administración, y queda auditada.
  const settings = await app.inject({ method: "PATCH", url: "/api/v1/admin/rewards/settings", headers: headers(admin), payload: { pointsPerReward: 3000, rewardName: "Barrita" } });
  assert.equal(settings.statusCode, 200, settings.body);
  assert.equal(settings.json().settings.pointsPerReward, 3000);
  const coachSettings = await app.inject({ method: "PATCH", url: "/api/v1/admin/rewards/settings", headers: headers(coach), payload: { pointsPerReward: 100 } });
  assert.equal(coachSettings.statusCode, 403);
  const overview = await app.inject({ method: "GET", url: "/api/v1/admin/rewards", headers: headers(admin) });
  assert.equal(overview.statusCode, 200, overview.body);
  assert.ok(overview.json().balances.some((b: { memberId: string; balance: number }) => b.memberId === ana.memberId && b.balance === 500));
  await pool.query("UPDATE reward_settings SET points_per_reward = 5000, daily_points_cap = 1000, reward_name = 'Barra de cereal' WHERE id = true");

  // El miembro puede exportar sus partidas y puntos (derecho de acceso).
  const exported = await app.inject({ method: "GET", url: `/api/v1/members/${ana.memberId}/export`, headers: headers(ana) });
  assert.equal(exported.statusCode, 200, exported.body);
  assert.ok(exported.json().gameRuns.length >= 5);
  assert.ok(exported.json().rewardPoints.length >= 3);
});
