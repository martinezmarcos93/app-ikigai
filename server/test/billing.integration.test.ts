import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";
import { runDailyBilling, todayIn } from "../src/domain/billing.js";
import type { PushTarget } from "../src/domain/web-push.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://billing-integration.example.com";
const internalToken = "billing-internal-token-with-more-than-32-characters";
const config = loadConfig({
  NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "billing-integration-secret-with-more-than-32-characters",
  INTERNAL_JOB_TOKEN: internalToken
});

async function user(pool: pg.Pool, role: "admin" | "member") {
  const userId = String((await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-placeholder-hash','local','active') RETURNING id",
    [`billing-it-${randomUUID()}@example.test`]
  )).rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let memberId: string | null = null;
  if (role === "member") memberId = String((await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,'Socia cobros','active') RETURNING id", [userId])).rows[0]?.id);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  return { userId, memberId: memberId!, headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) } };
}

function device() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
}

test("cobros: recordatorios, propuesta de recargo pasada la tolerancia y aprobacion por administracion", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const sent: { target: PushTarget; payload: Record<string, unknown> }[] = [];
  const pushSender = async (target: PushTarget, payload: string) => { sent.push({ target, payload: JSON.parse(payload) }); return { status: 201 }; };
  const app = await buildApp(config, { db, transactionalDb: db, pushSender });
  t.after(async () => {
    await pool.query("UPDATE billing_rules SET default_due_day=10, grace_days=2, late_fee_percent=NULL, late_fees_since=NULL, due_reminders_enabled=true WHERE id=1");
    await app.close(); await pool.end();
  });

  const admin = await user(pool, "admin");
  const debe = await user(pool, "member");     // no paga
  const pago = await user(pool, "member");     // paga a tiempo
  const tarde = await user(pool, "member");    // vence el 20 (empezo a mitad de mes)
  const telDebe = device(); const telPago = device(); const telTarde = device();
  for (const [who, tel] of [[debe, telDebe], [pago, telPago], [tarde, telTarde]] as const)
    await pool.query("INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4)", [who.userId, tel.endpoint, tel.p256dh, tel.auth]);
  const service = String((await pool.query("INSERT INTO services (name) VALUES ($1) RETURNING id", [`Musculacion ${randomUUID()}`])).rows[0]?.id);
  const membership = async (memberId: string, startsOn: string) => String((await pool.query(
    "INSERT INTO memberships (member_id,service_id,starts_on,billing_period,agreed_price,status,created_by) VALUES ($1,$2,$3,'monthly',25000,'active',$4) RETURNING id",
    [memberId, service, startsOn, admin.userId])).rows[0]?.id);
  await membership(debe.memberId, "2026-01-05");
  await membership(pago.memberId, "2026-01-05");
  const membresiaTarde = await membership(tarde.memberId, "2026-01-20");
  const movimiento = (memberId: string, type: "charge" | "payment", amount: string, on: string) => pool.query(
    "INSERT INTO ledger_entries (member_id,entry_type,direction,amount,description,occurred_on,applied_period,created_by) VALUES ($1,$2,$3,$4,'test',$5,$6,$7)",
    [memberId, type, type === "charge" ? "debit" : "credit", amount, on, `${on.slice(0, 7)}-01`, admin.userId]);
  // Cuota de febrero sin pagar (anterior a la activacion de recargos) y cuota de marzo.
  await movimiento(debe.memberId, "charge", "25000", "2026-02-01");
  await movimiento(debe.memberId, "charge", "25000", "2026-03-01");
  await movimiento(pago.memberId, "charge", "25000", "2026-03-01");
  await movimiento(pago.memberId, "payment", "25000", "2026-03-05");

  // ---- Reglas: solo administracion; al activar el recargo cuenta desde hoy ----
  const reglas = (headers: Record<string, string>, payload: object) => app.inject({ method: "PATCH", url: "/api/v1/admin/billing-rules", headers, payload });
  assert.equal((await reglas(debe.headers, { grace_days: 3 })).statusCode, 403);
  assert.equal((await reglas(admin.headers, { default_due_day: 29 })).statusCode, 400);
  assert.equal((await reglas(admin.headers, { late_fee_percent: "0" })).statusCode, 400);
  assert.equal((await reglas(admin.headers, { late_fee_percent: "150" })).statusCode, 400);
  const activadas = (await reglas(admin.headers, { late_fee_percent: "10", grace_days: 2, default_due_day: 10 })).json().rules;
  assert.equal(activadas.late_fee_percent, "10.00");
  assert.equal(activadas.late_fees_since, todayIn(config.gymTimezone));
  assert.equal((await reglas(admin.headers, { late_fee_percent: null })).json().rules.late_fees_since, null);
  // Para probar con fechas fijas: recargos activos desde el 1/3/2026.
  await pool.query("UPDATE billing_rules SET late_fee_percent=10, late_fees_since='2026-03-01' WHERE id=1");

  // ---- Vencimiento propio: el 20 ----
  const diaPropio = (headers: Record<string, string>, id: string, payload: object) => app.inject({ method: "PATCH", url: `/api/v1/memberships/${id}/due-day`, headers, payload });
  assert.equal((await diaPropio(debe.headers, membresiaTarde, { due_day: 20 })).statusCode, 403);
  assert.equal((await diaPropio(admin.headers, membresiaTarde, { due_day: 31 })).statusCode, 400);
  assert.equal((await diaPropio(admin.headers, randomUUID(), { due_day: 20 })).statusCode, 404);
  assert.equal((await diaPropio(admin.headers, membresiaTarde, { due_day: 20 })).json().membership.due_day, 20);

  const correr = (today: string) => runDailyBilling(db, pushSender, app.log, today);
  const mios = new Set([telDebe.endpoint, telPago.endpoint, telTarde.endpoint]);
  const avisos = () => sent.filter((s) => mios.has(s.target.endpoint)).map((s) => ({ a: s.target.endpoint, body: String(s.payload.body) }));
  const propuestas = async () => (await pool.query(
    "SELECT member_id, period::text AS period, debt_amount::text AS debt, fee_amount::text AS fee, status, id FROM late_fee_proposals WHERE member_id = ANY($1::uuid[]) ORDER BY period",
    [[debe.memberId, pago.memberId, tarde.memberId]])).rows;

  // Dia anterior al 10: le llega a quien debe (con el monto adeudado); quien ya pago no recibe nada.
  await correr("2026-03-09");
  assert.deepEqual(avisos().map((x) => x.a), [telDebe.endpoint]);
  assert.match(avisos()[0]!.body, /^Tu cuota de \$\s?50\.000 vence mañana\.$/);
  await correr("2026-03-09");
  assert.equal(avisos().length, 1, "la tarea repetida no duplica recordatorios");
  sent.length = 0;
  await correr("2026-03-10");
  assert.deepEqual(avisos().map((x) => x.a), [telDebe.endpoint]);
  assert.match(avisos()[0]!.body, /vence hoy\.$/);

  // Hasta el ultimo dia de tolerancia (10 + 2 = 12) no hay propuesta; el 13 si. Febrero no: es anterior a la activacion.
  await correr("2026-03-12");
  assert.equal((await propuestas()).length, 0);
  await correr("2026-03-13");
  await correr("2026-03-13");
  const [propuesta, ...otras] = await propuestas();
  assert.equal(otras.length, 0, "una sola propuesta: ni duplicada ni para quien pago ni para febrero");
  assert.equal(propuesta?.member_id, debe.memberId);
  assert.equal(propuesta?.period, "2026-03-01");
  assert.equal(propuesta?.debt, "50000.00");
  assert.equal(propuesta?.fee, "5000.00");
  assert.equal(propuesta?.status, "pending");

  // Quien vence el 20: recordatorio el 19 con la cuota acordada (no tiene cargo cargado), sin propuesta (no debe nada).
  sent.length = 0;
  await correr("2026-03-19");
  assert.deepEqual(avisos().map((x) => x.a), [telTarde.endpoint]);
  assert.match(avisos()[0]!.body, /25\.000 vence mañana/);
  await correr("2026-03-23");
  assert.equal((await propuestas()).length, 1);

  // Recordatorios apagados: no se manda nada.
  await pool.query("UPDATE billing_rules SET due_reminders_enabled=false WHERE id=1");
  sent.length = 0;
  await correr("2026-04-09");
  assert.equal(avisos().length, 0);

  // ---- Aprobar / descartar: solo administracion ----
  const listar = (headers: Record<string, string>) => app.inject({ method: "GET", url: "/api/v1/admin/late-fee-proposals", headers });
  assert.equal((await listar(debe.headers)).statusCode, 403);
  assert.ok((await listar(admin.headers)).json().proposals.some((p: { id: string; member_name: string }) => p.id === propuesta?.id && p.member_name === "Socia cobros"));
  const accion = (headers: Record<string, string>, id: string, verbo: "approve" | "dismiss") => app.inject({ method: "POST", url: `/api/v1/admin/late-fee-proposals/${id}/${verbo}`, headers, payload: {} });
  assert.equal((await accion(debe.headers, propuesta!.id, "approve")).statusCode, 403);
  assert.equal((await accion({ ...admin.headers, "x-csrf-token": "x" }, propuesta!.id, "approve")).statusCode, 403);
  const aprobada = await accion(admin.headers, propuesta!.id, "approve");
  assert.equal(aprobada.statusCode, 201);
  assert.equal((await accion(admin.headers, propuesta!.id, "approve")).statusCode, 200, "aprobar dos veces no duplica");
  assert.equal((await accion(admin.headers, propuesta!.id, "dismiss")).statusCode, 409, "un recargo aprobado se revierte, no se descarta");
  const recargos = (await pool.query("SELECT amount::text AS amount, description, applied_period::text AS period FROM ledger_entries WHERE member_id=$1 AND description LIKE 'Recargo%'", [debe.memberId])).rows;
  assert.deepEqual(recargos, [{ amount: "5000.00", description: "Recargo por mora marzo 2026 (10.00% de $50000.00)", period: "2026-03-01" }]);
  assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='billing.late_fee_approved' AND entity_id=$1", [propuesta!.id])).rowCount, 1);

  // Abril: propuesta nueva que se descarta sin movimiento.
  await correr("2026-04-13");
  const abril = (await propuestas()).find((p) => p.period === "2026-04-01");
  assert.ok(abril);
  assert.equal((await accion(admin.headers, abril.id, "dismiss")).statusCode, 204);
  assert.equal((await accion(admin.headers, abril.id, "dismiss")).statusCode, 204);
  assert.equal((await accion(admin.headers, abril.id, "approve")).statusCode, 409);
  assert.equal((await pool.query("SELECT 1 FROM ledger_entries WHERE member_id=$1 AND description LIKE 'Recargo por mora abril%'", [debe.memberId])).rowCount, 0);
});

test("cobros: la tarea diaria solo corre con el token interno", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  const sinToken = await buildApp(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "billing-integration-secret-with-more-than-32-characters" }), { db, transactionalDb: db });
  t.after(async () => { await app.close(); await sinToken.close(); await pool.end(); });
  const daily = (target: typeof app, headers: Record<string, string>) => target.inject({ method: "POST", url: "/api/v1/internal/daily", headers });
  assert.equal((await daily(app, {})).statusCode, 404);
  assert.equal((await daily(app, { "x-internal-token": "otro-token-de-mas-de-32-caracteres-xxxxxx" })).statusCode, 404);
  const ok = await daily(app, { "x-internal-token": internalToken });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().today, todayIn(config.gymTimezone));
  assert.equal((await daily(sinToken, { "x-internal-token": internalToken })).statusCode, 404, "sin INTERNAL_JOB_TOKEN configurado la tarea no corre");
  assert.throws(() => loadConfig({ NODE_ENV: "test", INTERNAL_JOB_TOKEN: "corto" }), /32/);
});
