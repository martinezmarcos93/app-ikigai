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
const origin = "https://notices-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "notices-integration-secret-with-more-than-32-characters"
});

type Role = "admin" | "member" | "coach";

async function createActor(pool: pg.Pool, label: string, role: Role) {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [`notices-it-${randomUUID()}@example.test`, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let memberId: string | null = null;
  let coachId: string | null = null;
  if (role === "coach") {
    coachId = String((await pool.query(
      "INSERT INTO coach_profiles (user_id,full_name,discipline,active) VALUES ($1,$2,'Test',true) RETURNING id", [userId, label]
    )).rows[0]?.id);
  } else {
    memberId = String((await pool.query(
      "INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, label]
    )).rows[0]?.id);
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

test("PostgreSQL notices and lateness: informative only, owner-scoped, closed once the class starts", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000,
    application_name: "ikigai-notices-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Admin ${suffix}`, "admin");
  const coach = await createActor(pool, `Coach ${suffix}`, "coach");
  const otherCoach = await createActor(pool, `Otro Coach ${suffix}`, "coach");
  const memberA = await createActor(pool, `Socia A ${suffix}`, "member");
  const memberB = await createActor(pool, `Socia B ${suffix}`, "member");
  const serviceId = String((await pool.query("INSERT INTO services (name, active) VALUES ($1, true) RETURNING id", [`Aviso ${suffix}`])).rows[0]?.id);
  const templateId = String((await pool.query(
    `INSERT INTO class_templates (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity, active)
     VALUES ($1, $2, 2, '10:00', 60, 5, true) RETURNING id`, [serviceId, coach.coachId]
  )).rows[0]?.id);
  const sessionId = String((await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot)
     VALUES ($1, now() + interval '3 days', now() + interval '3 days 1 hour', 5) RETURNING id`, [templateId]
  )).rows[0]?.id);
  const bookingA = String((await pool.query(
    "INSERT INTO bookings (session_id, member_id, status) VALUES ($1,$2,'confirmed') RETURNING id", [sessionId, memberA.memberId]
  )).rows[0]?.id);
  const bookingB = String((await pool.query(
    "INSERT INTO bookings (session_id, member_id, status) VALUES ($1,$2,'confirmed') RETURNING id", [sessionId, memberB.memberId]
  )).rows[0]?.id);
  const ledgerBefore = Number((await pool.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0]?.n);
  const url = `/api/v1/bookings/${bookingA}/notice`;

  // --- Autorizacion -------------------------------------------------------
  assert.equal((await app.inject({ method: "PUT", url, headers: { origin }, payload: { kind: "late" } })).statusCode, 401);
  for (const [who, actor] of [["otra socia", memberB], ["profesor de la clase", coach], ["otro profesor", otherCoach]] as const) {
    const denied = await app.inject({ method: "PUT", url, headers: headers(actor), payload: { kind: "late" } });
    assert.equal(denied.statusCode, 404, `${who} no deberia poder avisar por una reserva ajena`);
  }
  assert.equal((await app.inject({ method: "PUT", url, headers: { origin, cookie: `ikigai_session=${memberA.token}` }, payload: { kind: "late" } })).statusCode, 403, "sin CSRF");

  // --- Validacion ---------------------------------------------------------
  for (const payload of [{ kind: "vacaciones" }, {}, { kind: "late", note: "x".repeat(201) }, { kind: "late", extra: true }]) {
    assert.equal((await app.inject({ method: "PUT", url, headers: headers(memberA), payload })).statusCode, 400);
  }

  // --- Alta, cambio y baja ------------------------------------------------
  const late = await app.inject({ method: "PUT", url, headers: headers(memberA), payload: { kind: "late", note: "  Salgo del trabajo a las 10:15  " } });
  assert.equal(late.statusCode, 200);
  assert.equal(late.json().notice.kind, "late");
  assert.equal(late.json().notice.note, "Salgo del trabajo a las 10:15");     // se recorta
  const absence = await app.inject({ method: "PUT", url, headers: headers(memberA), payload: { kind: "absence" } });
  assert.equal(absence.statusCode, 200);
  assert.equal(absence.json().notice.note, null);
  assert.equal((await pool.query("SELECT 1 FROM booking_notices WHERE booking_id = $1", [bookingA])).rowCount, 1, "un solo aviso por reserva");

  // El profesor de la clase y administracion lo ven en la lista; el aviso propio vuelve en la agenda de la socia.
  const roster = await app.inject({ method: "GET", url: `/api/v1/class-sessions/${sessionId}/attendance`, headers: headers(coach) });
  assert.equal(roster.statusCode, 200);
  const rowA = roster.json().records.find((r: { booking_id: string }) => r.booking_id === bookingA);
  const rowB = roster.json().records.find((r: { booking_id: string }) => r.booking_id === bookingB);
  assert.equal(rowA.notice_kind, "absence");
  assert.equal(rowB.notice_kind, null);
  const agenda = await app.inject({ method: "GET", url: "/api/v1/class-sessions", headers: headers(memberA) });
  const mine = agenda.json().items.find((s: { id: string }) => s.id === sessionId);
  assert.equal(mine.my_notice_kind, "absence");
  const agendaB = await app.inject({ method: "GET", url: "/api/v1/class-sessions", headers: headers(memberB) });
  assert.equal(agendaB.json().items.find((s: { id: string }) => s.id === sessionId).my_notice_kind, null, "el aviso de una socia no se ve en la agenda de otra");

  // Informativo: la reserva sigue confirmada, el cupo ocupado y no hay movimientos de dinero.
  assert.equal((await pool.query("SELECT status FROM bookings WHERE id = $1", [bookingA])).rows[0]?.status, "confirmed");
  assert.equal(Number((await pool.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0]?.n), ledgerBefore);

  // Administracion puede quitarlo; quitar uno que no hay es idempotente.
  const removed = await app.inject({ method: "DELETE", url, headers: headers(admin) });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().notice, null);
  assert.equal((await app.inject({ method: "DELETE", url, headers: headers(memberA) })).statusCode, 200);
  assert.equal((await pool.query("SELECT 1 FROM booking_notices WHERE booking_id = $1", [bookingA])).rowCount, 0);

  // --- Auditoria (sin la nota: puede tener datos personales) -----------------
  const audit = await pool.query(
    "SELECT action, after_data FROM audit_events WHERE entity_id = $1 AND action LIKE 'booking.notice_%' ORDER BY id", [bookingA]
  );
  assert.deepEqual(audit.rows.map((r) => r.action), ["booking.notice_set", "booking.notice_set", "booking.notice_removed"]);
  assert.equal(JSON.stringify(audit.rows[0]?.after_data).includes("Salgo del trabajo"), false);

  // --- Asistencia con llegada tarde ------------------------------------------
  await pool.query("UPDATE class_sessions SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' WHERE id = $1", [sessionId]);
  const attendance = (records: unknown[]) => app.inject({
    method: "PUT", url: `/api/v1/class-sessions/${sessionId}/attendance`, headers: headers(coach), payload: { records }
  });
  assert.equal((await attendance([{ bookingId: bookingA, attended: false, arrivedLate: true }])).statusCode, 400, "no se puede llegar tarde sin asistir");
  const first = await attendance([{ bookingId: bookingA, attended: true, arrivedLate: true }, { bookingId: bookingB, attended: true }]);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().created, 2);
  const stored = async (booking: string) => (await pool.query("SELECT attended, arrived_late FROM attendance_records WHERE booking_id = $1", [booking])).rows[0];
  assert.deepEqual(await stored(bookingA), { attended: true, arrived_late: true });
  assert.deepEqual(await stored(bookingB), { attended: true, arrived_late: false });
  // Repetir lo mismo no cambia nada; omitir arrivedLate conserva lo anterior.
  assert.equal((await attendance([{ bookingId: bookingA, attended: true, arrivedLate: true }])).json().unchanged, 1);
  assert.equal((await attendance([{ bookingId: bookingA, attended: true }])).json().unchanged, 1);
  assert.deepEqual(await stored(bookingA), { attended: true, arrived_late: true });
  // Corregir: dejar de ser «tarde», y luego pasar a ausente (que borra la llegada tarde).
  assert.equal((await attendance([{ bookingId: bookingA, attended: true, arrivedLate: false }])).json().updated, 1);
  assert.deepEqual(await stored(bookingA), { attended: true, arrived_late: false });
  await attendance([{ bookingId: bookingB, attended: true, arrivedLate: true }]);
  assert.equal((await attendance([{ bookingId: bookingB, attended: false }])).json().updated, 1);
  assert.deepEqual(await stored(bookingB), { attended: false, arrived_late: false });
  await assert.rejects(pool.query("UPDATE attendance_records SET arrived_late = true WHERE booking_id = $1", [bookingB]), /attendance_late_requires_presence/);

  // La lista del profesor y el historial de la socia muestran la llegada tarde.
  await attendance([{ bookingId: bookingA, attended: true, arrivedLate: true }]);
  const roster2 = await app.inject({ method: "GET", url: `/api/v1/class-sessions/${sessionId}/attendance`, headers: headers(coach) });
  assert.equal(roster2.json().records.find((r: { booking_id: string }) => r.booking_id === bookingA).arrived_late, true);
  const history = await app.inject({ method: "GET", url: `/api/v1/members/${memberA.memberId}/attendance`, headers: headers(memberA) });
  assert.equal(history.json().records[0].arrived_late, true);

  // --- La clase ya empezo (o la reserva esta cancelada): ya no se puede avisar ---------------
  const started = await app.inject({ method: "PUT", url, headers: headers(memberA), payload: { kind: "late" } });
  assert.equal(started.statusCode, 409);
  assert.equal(started.json().error, "class_already_started");
  const futureSession = String((await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot)
     VALUES ($1, now() + interval '5 days', now() + interval '5 days 1 hour', 5) RETURNING id`, [templateId]
  )).rows[0]?.id);
  const cancelled = String((await pool.query(
    "INSERT INTO bookings (session_id, member_id, status, cancelled_at) VALUES ($1,$2,'cancelled', now()) RETURNING id", [futureSession, memberA.memberId]
  )).rows[0]?.id);
  const onCancelled = await app.inject({ method: "PUT", url: `/api/v1/bookings/${cancelled}/notice`, headers: headers(memberA), payload: { kind: "late" } });
  assert.equal(onCancelled.statusCode, 409);
  assert.equal(onCancelled.json().error, "booking_cancelled");
  assert.equal((await app.inject({ method: "PUT", url: `/api/v1/bookings/${randomUUID()}/notice`, headers: headers(memberA), payload: { kind: "late" } })).statusCode, 404);
});
