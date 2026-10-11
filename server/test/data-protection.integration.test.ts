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
const origin = "https://data-protection-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "data-protection-secret-with-more-than-32-characters"
});

type Role = "admin" | "member" | "coach";

async function createActor(pool: pg.Pool, label: string, role: Role, extra: Record<string, string> = {}) {
  const email = `dp-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
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
      `INSERT INTO member_profiles (user_id, full_name, email, phone, address, dni, emergency_contact_name,
                                    emergency_contact_phone, notes, status, joined_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active', '2026-01-01') RETURNING id`,
      [userId, label, email, extra.phone ?? null, extra.address ?? null, extra.dni ?? null,
        extra.emergencyName ?? null, extra.emergencyPhone ?? null, extra.notes ?? null]
    )).rows[0]?.id);
  }
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return { userId, email, memberId, coachId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}

const headers = (actor: { token: string; csrfToken: string }) => ({
  origin, cookie: `ikigai_session=${actor.token}`, "x-csrf-token": actor.csrfToken
});

test("PostgreSQL data protection: export is scoped and audited; anonymization erases identity but keeps accounting", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000,
    application_name: "ikigai-data-protection-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Admin ${suffix}`, "admin");
  const coach = await createActor(pool, `Coach ${suffix}`, "coach");
  const ana = await createActor(pool, `Ana Datos ${suffix}`, "member", {
    phone: "+54 11 5555-1111", address: "Calle Falsa 123", dni: "30111222",
    emergencyName: "Pedro Datos", emergencyPhone: "+54 11 5555-2222", notes: "Alergica a la penicilina"
  });
  const beto = await createActor(pool, `Beto Otro ${suffix}`, "member", { phone: "+54 11 5555-3333" });

  const serviceId = String((await pool.query("INSERT INTO services (name, active) VALUES ($1, true) RETURNING id", [`Servicio DP ${suffix}`])).rows[0]?.id);
  const templateId = String((await pool.query(
    `INSERT INTO class_templates (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity, active)
     VALUES ($1,$2,2,'10:00',60,5,true) RETURNING id`, [serviceId, coach.coachId]
  )).rows[0]?.id);
  const pastSession = String((await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot)
     VALUES ($1, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 5) RETURNING id`, [templateId]
  )).rows[0]?.id);
  const bookingAna = String((await pool.query("INSERT INTO bookings (session_id, member_id, status) VALUES ($1,$2,'confirmed') RETURNING id", [pastSession, ana.memberId])).rows[0]?.id);
  const bookingBeto = String((await pool.query("INSERT INTO bookings (session_id, member_id, status) VALUES ($1,$2,'confirmed') RETURNING id", [pastSession, beto.memberId])).rows[0]?.id);
  await pool.query("INSERT INTO attendance_records (booking_id, attended, arrived_late, recorded_by) VALUES ($1,true,true,$2)", [bookingAna, coach.userId]);
  await pool.query("INSERT INTO attendance_records (booking_id, attended, recorded_by) VALUES ($1,true,$2)", [bookingBeto, coach.userId]);
  await pool.query("INSERT INTO booking_notices (booking_id, kind, note, created_by) VALUES ($1,'late','Mi telefono es 1155551111',$2)", [bookingAna, ana.userId]);
  const membershipAna = String((await pool.query(
    `INSERT INTO memberships (member_id, service_id, starts_on, billing_period, agreed_price, status, created_by)
     VALUES ($1,$2,'2026-01-01','monthly',16000,'active',$3) RETURNING id`, [ana.memberId, serviceId, admin.userId]
  )).rows[0]?.id);
  for (const [type, direction, amount, description] of [["charge", "debit", "16000", "Cuota de enero"], ["payment", "credit", "10000", "Pago parcial"]]) {
    await pool.query(
      `INSERT INTO ledger_entries (member_id, entry_type, direction, amount, description, occurred_on, created_by)
       VALUES ($1,$2,$3,$4,$5,'2026-01-15',$6)`, [ana.memberId, type, direction, amount, description, admin.userId]
    );
  }
  await pool.query("INSERT INTO ledger_entries (member_id, entry_type, direction, amount, description, occurred_on, created_by) VALUES ($1,'charge','debit',9999,'Cuota de Beto','2026-01-15',$2)", [beto.memberId, admin.userId]);
  const routineId = String((await pool.query("INSERT INTO routines (name, discipline, level, created_by) VALUES ($1,'Funcional','inicial',$2) RETURNING id", [`Rutina DP ${suffix}`, admin.userId])).rows[0]?.id);
  const versionId = String((await pool.query("INSERT INTO routine_versions (routine_id, version_number, created_by) VALUES ($1,1,$2) RETURNING id", [routineId, admin.userId])).rows[0]?.id);
  await pool.query("INSERT INTO routine_assignments (member_id, routine_version_id, assigned_by, starts_on, notes) VALUES ($1,$2,$3,'2026-01-01','Cuidar la rodilla de Ana')", [ana.memberId, versionId, admin.userId]);

  // ============================== EXPORTACION ==============================
  const url = `/api/v1/members/${ana.memberId}/export`;
  assert.equal((await app.inject({ method: "GET", url, headers: { origin } })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url, headers: headers(beto) })).statusCode, 404, "otra persona no puede exportar");
  assert.equal((await app.inject({ method: "GET", url, headers: headers(coach) })).statusCode, 404, "un profesor no exporta datos de miembros");
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/members/${randomUUID()}/export`, headers: headers(admin) })).statusCode, 404);

  const exported = await app.inject({ method: "GET", url, headers: headers(ana) });
  assert.equal(exported.statusCode, 200);
  assert.equal(exported.headers["cache-control"], "no-store");
  assert.match(String(exported.headers["content-disposition"]), /attachment; filename="ikigai-datos-.*\.json"/);
  const data = exported.json();
  assert.equal(data.format, "ikigai-member-export");
  assert.equal(data.member.dni, "30111222");
  assert.equal(data.member.emergency_contact_name, "Pedro Datos");
  assert.equal(data.member.notes, "Alergica a la penicilina");
  assert.equal(data.account.email, ana.email);
  assert.equal(data.memberships.length, 1);
  assert.equal(data.ledgerEntries.length, 2);
  assert.equal(data.bookings.length, 1);
  assert.equal(data.attendance[0].arrived_late, true);
  assert.equal(data.bookingNotices[0].note, "Mi telefono es 1155551111");
  assert.equal(data.routineAssignments[0].routine, `Rutina DP ${suffix}`);
  const text = exported.body;
  for (const ajeno of [beto.email, "Beto Otro", "+54 11 5555-3333", "Cuota de Beto"]) {
    assert.equal(text.includes(ajeno), false, `la exportacion de Ana contiene datos ajenos: ${ajeno}`);
  }
  assert.equal(text.includes("password"), false, "la exportacion no debe incluir hashes de contrasenas");
  assert.equal((await app.inject({ method: "GET", url, headers: headers(admin) })).statusCode, 200);
  const exportAudit = await pool.query("SELECT actor_user_id, after_data FROM audit_events WHERE entity_id = $1 AND action = 'member.data_exported' ORDER BY id", [ana.memberId]);
  assert.equal(exportAudit.rowCount, 2);
  assert.equal(JSON.stringify(exportAudit.rows).includes("30111222"), false, "la auditoria no debe copiar el contenido exportado");

  // ============================== ANONIMIZACION ==============================
  const anonymize = (actor: typeof ana, payload: unknown = { reason: "Pedido de la persona al darse de baja", confirm: "ANONIMIZAR" }) =>
    app.inject({ method: "POST", url: `/api/v1/members/${ana.memberId}/anonymize`, headers: headers(actor), payload: payload as object });
  assert.equal((await anonymize(ana)).statusCode, 403, "la propia persona no ejecuta el borrado: lo hace administracion");
  assert.equal((await anonymize(coach)).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/api/v1/members/${ana.memberId}/anonymize`, headers: { origin }, payload: { reason: "motivo valido", confirm: "ANONIMIZAR" } })).statusCode, 401);
  for (const payload of [{}, { reason: "ok" }, { reason: "motivo valido" }, { reason: "motivo valido", confirm: "si" }, { reason: "motivo valido", confirm: "ANONIMIZAR", extra: 1 }]) {
    assert.equal((await anonymize(admin, payload)).statusCode, 400, JSON.stringify(payload));
  }
  assert.equal((await anonymize(admin)).json().error, "member_not_exited", "solo quien dejo el gimnasio");

  await pool.query("UPDATE member_profiles SET status = 'exited', exited_on = '2026-09-30' WHERE id = $1", [ana.memberId]);
  assert.equal((await anonymize(admin)).json().error, "member_has_open_memberships");
  await pool.query("UPDATE memberships SET status = 'ended', ends_on = '2026-09-30' WHERE id = $1", [membershipAna]);
  const futureSession = String((await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot)
     VALUES ($1, now() + interval '2 days', now() + interval '2 days' + interval '1 hour', 5) RETURNING id`, [templateId]
  )).rows[0]?.id);
  const upcoming = String((await pool.query("INSERT INTO bookings (session_id, member_id, status) VALUES ($1,$2,'confirmed') RETURNING id", [futureSession, ana.memberId])).rows[0]?.id);
  assert.equal((await anonymize(admin)).json().error, "member_has_upcoming_bookings");
  await pool.query("UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [upcoming]);

  const balanceBefore = (await pool.query("SELECT sum(CASE direction WHEN 'debit' THEN amount ELSE -amount END) AS s FROM ledger_entries WHERE member_id = $1", [ana.memberId])).rows[0]?.s;
  const done = await anonymize(admin);
  assert.equal(done.statusCode, 200);
  assert.equal(done.json().alreadyAnonymized, false);
  assert.equal(done.json().accountClosed, true);

  // La identidad se fue...
  const profile = (await pool.query(
    "SELECT full_name, email, phone, address, dni, emergency_contact_name, emergency_contact_phone, notes, anonymized_at, status FROM member_profiles WHERE id = $1", [ana.memberId]
  )).rows[0];
  assert.equal(profile.full_name, "Persona anonimizada");
  for (const campo of ["email", "phone", "address", "dni", "emergency_contact_name", "emergency_contact_phone", "notes"]) assert.equal(profile[campo], null, campo);
  assert.ok(profile.anonymized_at);
  assert.equal(profile.status, "exited");
  const account = (await pool.query("SELECT email, status, password_hash FROM users WHERE id = $1", [ana.userId])).rows[0];
  assert.notEqual(account.email, ana.email);
  assert.match(account.email, /@anonimizado\.invalid$/);
  assert.equal(account.status, "disabled");
  assert.notEqual(account.password_hash, "integration-test-placeholder-hash");
  assert.equal((await pool.query("SELECT note FROM booking_notices WHERE booking_id = $1", [bookingAna])).rows[0]?.note, null);
  assert.equal((await pool.query("SELECT notes FROM routine_assignments WHERE member_id = $1", [ana.memberId])).rows[0]?.notes, null);
  // ...y no puede volver a entrar: ni con la sesion que tenia ni con su correo anterior.
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: headers(ana) })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { email: ana.email, password: "cualquier-clave-larga-123" } });
  assert.equal(login.statusCode, 401);

  // ...pero la contabilidad y la asistencia agregada se conservan intactas.
  const balanceAfter = (await pool.query("SELECT sum(CASE direction WHEN 'debit' THEN amount ELSE -amount END) AS s FROM ledger_entries WHERE member_id = $1", [ana.memberId])).rows[0]?.s;
  assert.equal(balanceAfter, balanceBefore);
  assert.equal((await pool.query("SELECT 1 FROM ledger_entries WHERE member_id = $1", [ana.memberId])).rowCount, 2);
  assert.equal((await pool.query("SELECT 1 FROM attendance_records WHERE booking_id = $1", [bookingAna])).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM memberships WHERE member_id = $1", [ana.memberId])).rowCount, 1);
  // Otra persona no se toca.
  assert.equal((await pool.query("SELECT phone FROM member_profiles WHERE id = $1", [beto.memberId])).rows[0]?.phone, "+54 11 5555-3333");

  // Idempotente, sin editar y con la exportacion ya sin datos personales.
  const again = await anonymize(admin);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().alreadyAnonymized, true);
  assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE entity_id = $1 AND action = 'member.anonymized'", [ana.memberId])).rowCount, 1, "una sola auditoria");
  const edit = await app.inject({ method: "PATCH", url: `/api/v1/members/${ana.memberId}`, headers: headers(admin), payload: { phone: "123" } });
  assert.equal(edit.statusCode, 409);
  assert.equal(edit.json().error, "member_anonymized");
  const after = (await app.inject({ method: "GET", url, headers: headers(admin) })).body;
  for (const dato of ["30111222", "Pedro Datos", "Alergica", "Calle Falsa", ana.email, "Mi telefono es"]) {
    assert.equal(after.includes(dato), false, `la exportacion posterior a la anonimizacion aun contiene: ${dato}`);
  }
  const audit = (await pool.query("SELECT reason, after_data FROM audit_events WHERE entity_id = $1 AND action = 'member.anonymized'", [ana.memberId])).rows[0];
  assert.equal(audit.reason, "Pedido de la persona al darse de baja");
  assert.deepEqual(audit.after_data, { accountClosed: true });
});
