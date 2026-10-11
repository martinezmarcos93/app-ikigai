import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";
import { hashPassword } from "../src/security/password.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://access-control.example.test";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "access-control-secret-with-more-than-32-characters" });
const PASSWORD = "clave-inicial-segura-1";

async function person(pool: pg.Pool, role: "admin" | "member" | "coach", memberStatus = "active") {
  const email = `ac-${randomUUID()}@example.test`;
  const user = await pool.query("INSERT INTO users (email,username,password_hash,auth_provider,status) VALUES ($1,$2,$3,'local','active') RETURNING id",
    [email, `ikigai-${role}-${randomUUID().slice(0, 8).replace(/[0-9]/g, "x")}`, await hashPassword(PASSWORD)]);
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let profileId = "";
  if (role === "member") profileId = String((await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,$3) RETURNING id", [userId, `Miembro ${email}`, memberStatus])).rows[0]?.id);
  if (role === "coach") profileId = String((await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline,active) VALUES ($1,$2,'Yoga',true) RETURNING id", [userId, `Profesor ${email}`])).rows[0]?.id);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  const headers = { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) };
  return { userId, email, profileId, headers };
}

test("administracion deshabilita y vuelve a habilitar el acceso de miembros y profesores", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });
  await pool.query("DELETE FROM rate_limit_buckets");

  const admin = await person(pool, "admin");
  const member = await person(pool, "member");
  const coach = await person(pool, "coach");
  const other = await person(pool, "member");
  const post = (action: string, userId: string, headers: Record<string, string>) =>
    app.inject({ method: "POST", url: `/api/v1/admin/accounts/${userId}/${action}`, headers, payload: {} });

  // Solo administracion, y con CSRF.
  assert.equal((await post("disable", member.userId, other.headers)).statusCode, 403);
  assert.equal((await post("disable", member.userId, { ...admin.headers, "x-csrf-token": "x" })).statusCode, 403);
  // Una cuenta de administracion no se puede deshabilitar desde aca.
  assert.equal((await post("disable", admin.userId, admin.headers)).statusCode, 404);
  // Habilitar a quien nunca se deshabilito no existe.
  assert.equal((await post("enable", member.userId, admin.headers)).statusCode, 404);

  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: member.headers })).statusCode, 200);
  const disabled = await post("disable", member.userId, admin.headers);
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().accountStatus, "suspended");

  // Sin acceso al instante: la sesion que ya tenia deja de valer y no puede volver a entrar.
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: member.headers })).statusCode, 401);
  const blockedLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { login: member.email, password: PASSWORD } });
  assert.equal(blockedLogin.statusCode, 401);
  assert.equal((await post("disable", member.userId, admin.headers)).statusCode, 404, "ya estaba deshabilitado");

  // Su historial sigue: el perfil no se toca y aparece en «Accesos» como deshabilitado.
  const accounts = await app.inject({ method: "GET", url: "/api/v1/admin/accounts", headers: admin.headers });
  const row = accounts.json().accounts.find((a: { user_id: string }) => a.user_id === member.userId);
  assert.equal(row.account_status, "suspended");
  assert.equal((await pool.query("SELECT anonymized_at FROM member_profiles WHERE id=$1", [member.profileId])).rows[0]?.anonymized_at, null);

  // Una invitacion o un reseteo no lo reactivan (no es 'disabled').
  assert.equal((await app.inject({ method: "POST", url: `/api/v1/admin/accounts/${member.userId}/reset-password`, headers: admin.headers, payload: {} })).statusCode, 404);

  const enabled = await post("enable", member.userId, admin.headers);
  assert.equal(enabled.statusCode, 200);
  assert.equal(enabled.json().accountStatus, "active");
  const back = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { login: member.email, password: PASSWORD } });
  assert.equal(back.statusCode, 200, "con la misma clave de siempre");

  // Un profesor igual.
  assert.equal((await post("disable", coach.userId, admin.headers)).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: coach.headers })).statusCode, 401);
  assert.equal((await post("enable", coach.userId, admin.headers)).statusCode, 200);

  const audit = await pool.query("SELECT action, after_data FROM audit_events WHERE entity_id=ANY($1) AND action IN ('user.access_disabled','user.access_enabled') ORDER BY occurred_at, id", [[member.userId, coach.userId]]);
  assert.deepEqual(audit.rows.map((r) => r.action), ["user.access_disabled", "user.access_enabled", "user.access_disabled", "user.access_enabled"]);
  assert.equal(audit.rows[0]?.after_data.revokedSessions, 1);
});

test("una misma regla de elegibilidad vale para reservar, turnos fijos y lista de espera", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const service = String((await pool.query("INSERT INTO services (name, active) VALUES ($1, true) RETURNING id", [`Servicio ${suffix}`])).rows[0]?.id);
  const coachId = String((await pool.query("INSERT INTO coach_profiles (full_name, discipline, active) VALUES ($1,'Test',true) RETURNING id", [`Profe ${suffix}`])).rows[0]?.id);
  const template = String((await pool.query(
    "INSERT INTO class_templates (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity, active) VALUES ($1,$2,$3,'18:00',60,1,true) RETURNING id",
    [service, coachId, new Date().getUTCDay()])).rows[0]?.id);
  const starts = new Date(Date.now() + 180 * 60_000);
  const session = String((await pool.query(
    "INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot, status) VALUES ($1,$2,$3,1,'scheduled') RETURNING id",
    [template, starts.toISOString(), new Date(starts.getTime() + 3_600_000).toISOString()])).rows[0]?.id);

  const holder = await person(pool, "member", "active");
  const debtor = await person(pool, "member", "debtor");
  const suspended = await person(pool, "member", "suspended");
  const waiting = await person(pool, "member", "active");     // se vuelve deudor mientras espera
  const trial = await person(pool, "member", "trial");
  const book = (p: { headers: Record<string, string> }) => app.inject({ method: "POST", url: `/api/v1/class-sessions/${session}/bookings`, headers: p.headers });

  assert.equal((await book(debtor)).statusCode, 403);
  assert.equal((await book(suspended)).statusCode, 403);
  const first = await book(holder);
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().booking.status, "confirmed");
  const second = await book(waiting);
  assert.equal(second.json().booking.status, "waitlist");
  const third = await book(trial);
  assert.equal(third.statusCode, 201, "un miembro en prueba si puede reservar");
  assert.equal(third.json().booking.status, "waitlist");

  // Mientras espera pasa a deudor: al liberarse el cupo se promueve al siguiente elegible y el deudor sigue en espera.
  await pool.query("UPDATE member_profiles SET status='debtor' WHERE id=$1", [waiting.profileId]);
  const cancelled = await app.inject({ method: "POST", url: `/api/v1/bookings/${first.json().booking.id}/cancel`, headers: holder.headers });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().booking.promotedBooking.id, third.json().booking.id);
  const states = await pool.query("SELECT member_id, status FROM bookings WHERE session_id=$1", [session]);
  assert.equal(states.rows.find((r) => r.member_id === waiting.profileId)?.status, "waitlist", "no se le quita su lugar en la lista, solo no se lo promueve");
  assert.equal(states.rows.find((r) => r.member_id === trial.profileId)?.status, "confirmed");
});
