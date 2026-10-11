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
const origin = "https://schedule-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "schedule-integration-secret-with-more-than-32-characters",
  GYM_TIMEZONE: "America/Argentina/Buenos_Aires"
});

type Role = "admin" | "member" | "coach";

async function createActor(pool: pg.Pool, label: string, role: Role) {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [`schedule-it-${randomUUID()}@example.test`, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let memberId: string | null = null;
  let coachId: string | null = null;
  if (role === "coach") {
    const coach = await pool.query(
      "INSERT INTO coach_profiles (user_id,full_name,discipline,active) VALUES ($1,$2,'Test',true) RETURNING id", [userId, label]
    );
    coachId = String(coach.rows[0]?.id);
  } else {
    const member = await pool.query(
      "INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, label]
    );
    memberId = String(member.rows[0]?.id);
  }
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return { userId, memberId, coachId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}

const headers = (actor: { token: string; csrfToken: string }) => ({
  origin, cookie: `ikigai_session=${actor.token}`, "x-csrf-token": actor.csrfToken
});

// Fechas de un rango futuro y lejano, distinto en cada corrida, para no chocar con otros tests.
function isoDate(offsetDays: number): string {
  return new Date(Date.UTC(2031, 0, 1) + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

test("PostgreSQL schedule: templates, idempotent generation in the gym time zone, fixed slots and cancellation", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000,
    application_name: "ikigai-schedule-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Admin ${suffix}`, "admin");
  const coach = await createActor(pool, `Coach ${suffix}`, "coach");
  const memberA = await createActor(pool, `Member A ${suffix}`, "member");
  const memberB = await createActor(pool, `Member B ${suffix}`, "member");
  const service = await pool.query("INSERT INTO services (name, active) VALUES ($1, true) RETURNING id", [`Schedule Service ${suffix}`]);
  const serviceId = String(service.rows[0]?.id);

  // --- Autorizacion: solo administracion crea plantillas --------------------
  const template = {
    service_id: serviceId, coach_id: coach.coachId, weekday: 1, local_start_time: "19:30",
    duration_minutes: 60, capacity: 1
  };
  const asMember = await app.inject({ method: "POST", url: "/api/v1/class-templates", headers: headers(memberA), payload: template });
  assert.equal(asMember.statusCode, 403);
  const asCoach = await app.inject({ method: "POST", url: "/api/v1/class-templates", headers: headers(coach), payload: template });
  assert.equal(asCoach.statusCode, 403);

  // --- Crear plantilla --------------------------------------------------------
  const created = await app.inject({ method: "POST", url: "/api/v1/class-templates", headers: headers(admin), payload: template });
  assert.equal(created.statusCode, 201);
  const templateId = created.json().template.id as string;
  assert.equal(created.json().template.localStartTime, "19:30");
  assert.equal(created.json().template.coach.id, coach.coachId);

  const duplicate = await app.inject({ method: "POST", url: "/api/v1/class-templates", headers: headers(admin), payload: template });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error, "template_slot_taken");

  const badTime = await app.inject({ method: "POST", url: "/api/v1/class-templates", headers: headers(admin), payload: { ...template, local_start_time: "25:99" } });
  assert.equal(badTime.statusCode, 400);

  const ghostService = await app.inject({
    method: "POST", url: "/api/v1/class-templates", headers: headers(admin),
    payload: { ...template, service_id: randomUUID(), weekday: 2 }
  });
  assert.equal(ghostService.statusCode, 422);

  // El profesor ve sus plantillas; un miembro no ve ninguna.
  const own = await app.inject({ method: "GET", url: "/api/v1/class-templates", headers: headers(coach) });
  assert.equal(own.statusCode, 200);
  assert.ok(own.json().templates.some((x: { id: string }) => x.id === templateId));
  const memberList = await app.inject({ method: "GET", url: "/api/v1/class-templates", headers: headers(memberA) });
  assert.equal(memberList.statusCode, 403);

  // --- Turnos fijos --------------------------------------------------------
  const firstMonday = isoDate(0); // 2031-01-01 es miercoles; los lunes son +5, +12, +19, +26
  const assignA = await app.inject({
    method: "POST", url: `/api/v1/class-templates/${templateId}/assignments`, headers: headers(admin),
    payload: { member_id: memberA.memberId, starts_on: firstMonday }
  });
  assert.equal(assignA.statusCode, 201);
  const assignmentA = assignA.json().assignment.id as string;
  const assignDup = await app.inject({
    method: "POST", url: `/api/v1/class-templates/${templateId}/assignments`, headers: headers(admin),
    payload: { member_id: memberA.memberId, starts_on: firstMonday }
  });
  assert.equal(assignDup.statusCode, 409);
  const assignB = await app.inject({
    method: "POST", url: `/api/v1/class-templates/${templateId}/assignments`, headers: headers(admin),
    payload: { member_id: memberB.memberId, starts_on: firstMonday }
  });
  assert.equal(assignB.statusCode, 201);
  const badAssign = await app.inject({
    method: "POST", url: `/api/v1/class-templates/${templateId}/assignments`, headers: headers(admin),
    payload: { member_id: memberB.memberId, starts_on: "2031-02-30" }
  });
  assert.equal(badAssign.statusCode, 400);

  // --- Generacion: 4 lunes en 4 semanas, hora local -> UTC (UTC-3) ----------------
  const from = isoDate(0);
  const to = isoDate(27);
  const generated = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: from, to_date: to } });
  assert.equal(generated.statusCode, 201);
  assert.equal(generated.json().timezone, "America/Argentina/Buenos_Aires");
  const created1 = generated.json().created as number;
  assert.ok(created1 >= 4, `se esperaban al menos 4 instancias, hubo ${created1}`);

  const sessions = await pool.query(
    "SELECT id, starts_at, ends_at, capacity_snapshot FROM class_sessions WHERE template_id = $1 ORDER BY starts_at", [templateId]
  );
  assert.equal(sessions.rowCount, 4);
  // 19:30 en Buenos Aires (UTC-3, sin horario de verano) = 22:30 UTC.
  assert.equal(new Date(sessions.rows[0].starts_at).toISOString(), "2031-01-06T22:30:00.000Z");
  assert.equal(new Date(sessions.rows[0].ends_at).toISOString(), "2031-01-06T23:30:00.000Z");
  assert.equal(sessions.rows[0].capacity_snapshot, 1);

  // Turnos fijos: capacidad 1 -> A confirmado, B en espera, en cada instancia.
  const bookings = await pool.query(
    `SELECT b.status, b.member_id FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
      WHERE cs.template_id = $1 ORDER BY cs.starts_at, b.created_at`, [templateId]
  );
  assert.equal(bookings.rowCount, 8);
  assert.equal(bookings.rows.filter((r) => r.status === "confirmed" && r.member_id === memberA.memberId).length, 4);
  assert.equal(bookings.rows.filter((r) => r.status === "waitlist" && r.member_id === memberB.memberId).length, 4);

  // --- Idempotencia: repetir no duplica instancias ni reservas ---------------------
  const again = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: from, to_date: to } });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().created, 0);
  assert.ok(again.json().alreadyExisting >= 4);
  assert.equal((await pool.query("SELECT 1 FROM class_sessions WHERE template_id = $1", [templateId])).rowCount, 4);
  assert.equal((await pool.query("SELECT 1 FROM bookings b JOIN class_sessions cs ON cs.id=b.session_id WHERE cs.template_id=$1", [templateId])).rowCount, 8);

  // --- Rango invalido o demasiado grande -------------------------------------------
  const tooBig = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: from, to_date: isoDate(120) } });
  assert.equal(tooBig.statusCode, 400);
  assert.equal(tooBig.json().error, "date_range_too_large");
  const reversed = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: to, to_date: from } });
  assert.equal(reversed.statusCode, 400);
  const memberGenerate = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(memberA), payload: { from_date: from, to_date: to } });
  assert.equal(memberGenerate.statusCode, 403);

  // --- Cambiar la plantilla no reescribe instancias ya generadas ---------------------
  const patched = await app.inject({ method: "PATCH", url: `/api/v1/class-templates/${templateId}`, headers: headers(admin), payload: { capacity: 5 } });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().template.capacity, 5);
  const snapshot = await pool.query("SELECT DISTINCT capacity_snapshot FROM class_sessions WHERE template_id = $1", [templateId]);
  assert.deepEqual(snapshot.rows.map((r) => r.capacity_snapshot), [1]);
  const emptyPatch = await app.inject({ method: "PATCH", url: `/api/v1/class-templates/${templateId}`, headers: headers(admin), payload: {} });
  assert.equal(emptyPatch.statusCode, 400);
  const missing = await app.inject({ method: "PATCH", url: `/api/v1/class-templates/${randomUUID()}`, headers: headers(admin), payload: { capacity: 3 } });
  assert.equal(missing.statusCode, 404);

  // --- Cancelar una instancia libera sus reservas, sin efecto financiero ---------------
  const ledgerBefore = (await pool.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0].n;
  const victim = String(sessions.rows[1].id);
  const cancelled = await app.inject({ method: "POST", url: `/api/v1/class-sessions/${victim}/cancel`, headers: headers(admin), payload: { reason: "Profesor enfermo" } });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().cancelledBookings, 2);
  assert.equal((await pool.query("SELECT status FROM class_sessions WHERE id = $1", [victim])).rows[0].status, "cancelled");
  assert.equal((await pool.query("SELECT 1 FROM bookings WHERE session_id = $1 AND status IN ('confirmed','waitlist')", [victim])).rowCount, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0].n, ledgerBefore);
  const cancelAgain = await app.inject({ method: "POST", url: `/api/v1/class-sessions/${victim}/cancel`, headers: headers(admin), payload: {} });
  assert.equal(cancelAgain.statusCode, 409);

  // Una instancia cancelada no se regenera como duplicado (la clave unica sigue ocupada).
  const regen = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: from, to_date: to } });
  assert.equal(regen.json().created, 0);
  assert.equal((await pool.query("SELECT status FROM class_sessions WHERE id = $1", [victim])).rows[0].status, "cancelled");

  // --- Terminar un turno fijo ------------------------------------------------------------
  const ended = await app.inject({ method: "POST", url: `/api/v1/recurring-assignments/${assignmentA}/end`, headers: headers(admin), payload: {} });
  assert.equal(ended.statusCode, 200);
  assert.equal(ended.json().active, false);
  assert.ok(ended.json().upcomingBookingsKept >= 1, "las reservas ya generadas no se tocan");
  const endedAgain = await app.inject({ method: "POST", url: `/api/v1/recurring-assignments/${assignmentA}/end`, headers: headers(admin), payload: {} });
  assert.equal(endedAgain.statusCode, 409);

  // --- Desactivar la plantilla: ya no genera mas --------------------------------------------
  const off = await app.inject({ method: "PATCH", url: `/api/v1/class-templates/${templateId}`, headers: headers(admin), payload: { active: false } });
  assert.equal(off.statusCode, 200);
  const next = await app.inject({ method: "POST", url: "/api/v1/class-sessions/generate", headers: headers(admin), payload: { from_date: isoDate(28), to_date: isoDate(55) } });
  assert.equal((await pool.query("SELECT 1 FROM class_sessions WHERE template_id = $1", [templateId])).rowCount, 4);
  assert.ok([200, 201].includes(next.statusCode));

  // --- Auditoria -----------------------------------------------------------------------------
  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE actor_user_id = $1 AND action IN ('class_template.created','class_template.updated','class_sessions.generated','class_session.cancelled','recurring_assignment.created','recurring_assignment.ended')",
    [admin.userId]
  );
  const actions = new Set(audit.rows.map((r) => r.action));
  for (const expected of ["class_template.created", "class_template.updated", "class_sessions.generated", "class_session.cancelled", "recurring_assignment.created", "recurring_assignment.ended"]) {
    assert.ok(actions.has(expected), `falta auditoria: ${expected}`);
  }
});
