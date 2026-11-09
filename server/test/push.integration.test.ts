import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";
import { generateVapidKeys, type PushTarget } from "../src/domain/web-push.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://push-integration.example.com";
const vapid = generateVapidKeys();
const config = loadConfig({
  NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "push-integration-secret-with-more-than-32-characters",
  VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:test@example.com"
});

async function actor(pool: pg.Pool, role: "admin" | "member" | "coach") {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-placeholder-hash','local','active') RETURNING id",
    [`push-it-${randomUUID()}@example.test`]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  if (role === "member") await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,'Socia push','active')", [userId]);
  if (role === "coach") await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline) VALUES ($1,'Profe push','Test')", [userId]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  return { userId, headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) } };
}

function device(host = "fcm.googleapis.com") {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  return { endpoint: `https://${host}/fcm/send/${randomUUID()}`, keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test("push: suscribirse, recibir avisos segun destinatarios y limpiar dispositivos vencidos", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const sent: { target: PushTarget; payload: Record<string, unknown> }[] = [];
  const gone = new Set<string>();
  const rejected = new Set<string>();
  const pushSender = async (target: PushTarget, payload: string) => {
    sent.push({ target, payload: JSON.parse(payload) });
    return { status: gone.has(target.endpoint) ? 410 : rejected.has(target.endpoint) ? 403 : 201 };
  };
  const app = await buildApp(config, { db, transactionalDb: db, pushSender });
  t.after(async () => { await app.close(); await pool.end(); });
  await pool.query("DELETE FROM push_subscriptions");

  const admin = await actor(pool, "admin");
  const member = await actor(pool, "member");
  const coach = await actor(pool, "coach");
  const suscribir = (headers: Record<string, string>, payload: unknown) => app.inject({ method: "POST", url: "/api/v1/push/subscriptions", headers, payload: payload as object });

  // Configuracion publica para el portal (con sesion).
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/push/config" })).statusCode, 401);
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/v1/push/config", headers: member.headers })).json(), { enabled: true, publicKey: vapid.publicKey });

  // Validaciones: CSRF, endpoint de un servicio conocido, cuerpo estricto.
  const telMiembro = device();
  assert.equal((await suscribir({ ...member.headers, "x-csrf-token": "x" }, telMiembro)).statusCode, 403);
  assert.equal((await suscribir(member.headers, { ...telMiembro, endpoint: "https://evil.example.com/x" })).statusCode, 400);
  assert.equal((await suscribir(member.headers, { ...telMiembro, extra: 1 })).statusCode, 400);
  assert.equal((await suscribir(member.headers, telMiembro)).statusCode, 204);
  assert.equal((await suscribir(member.headers, telMiembro)).statusCode, 204, "suscribirse dos veces es idempotente");
  const iphoneProfe = device("web.push.apple.com");
  assert.equal((await suscribir(coach.headers, iphoneProfe)).statusCode, 204);
  const telAdmin = device();
  assert.equal((await suscribir(admin.headers, telAdmin)).statusCode, 204);
  assert.equal(Number((await pool.query("SELECT count(*) FROM push_subscriptions")).rows[0]?.count), 3);

  // Aviso solo para miembros: le llega al miembro; no al profe ni al admin que lo publico.
  const publicar = (payload: object) => app.inject({ method: "POST", url: "/api/v1/admin/announcements", headers: admin.headers, payload });
  assert.equal((await publicar({ title: "Cuota", body: "Recordatorio de cuota.", audience: "members" })).statusCode, 201);
  await settle();
  assert.deepEqual(sent.map((s) => s.target.endpoint), [telMiembro.endpoint]);
  assert.equal(sent[0]?.payload.title, "Cuota");
  assert.equal(sent[0]?.payload.kind, "announcement");
  assert.ok((await pool.query("SELECT last_success_at FROM push_subscriptions WHERE endpoint=$1", [telMiembro.endpoint])).rows[0]?.last_success_at);

  // Aviso general con texto largo: llega recortado a miembro y profe; el iPhone del profe ya no existe (410) y se borra.
  sent.length = 0;
  gone.add(iphoneProfe.endpoint);
  assert.equal((await publicar({ title: "Feriado", body: "x".repeat(500), audience: "all" })).statusCode, 201);
  await settle();
  assert.deepEqual(sent.map((s) => s.target.endpoint).sort(), [telMiembro.endpoint, iphoneProfe.endpoint].sort());
  assert.equal(String(sent[0]?.payload.body).length, 180);
  assert.equal((await pool.query("SELECT 1 FROM push_subscriptions WHERE endpoint=$1", [iphoneProfe.endpoint])).rowCount, 0);

  // Un acceso suspendido no recibe push.
  sent.length = 0;
  await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [member.userId]);
  assert.equal((await publicar({ title: "Otro", body: "Otro aviso.", audience: "members" })).statusCode, 201);
  await settle();
  assert.equal(sent.length, 0);
  await pool.query("UPDATE users SET status='active' WHERE id=$1", [member.userId]);

  // Prueba en el propio dispositivo y baja: solo se puede quitar una suscripcion propia.
  sent.length = 0;
  const prueba = await app.inject({ method: "POST", url: "/api/v1/push/test", headers: member.headers, payload: {} });
  assert.equal(prueba.statusCode, 200);
  assert.deepEqual(prueba.json(), { devices: 1, sent: 1, removed: 0, failed: 0 });
  assert.equal(sent[0]?.payload.kind, "test");
  // Un rechazo del servicio de push (p. ej. clave VAPID vieja) no cuenta como enviado ni borra el dispositivo.
  rejected.add(telMiembro.endpoint);
  assert.deepEqual((await app.inject({ method: "POST", url: "/api/v1/push/test", headers: member.headers, payload: {} })).json(), { devices: 1, sent: 0, removed: 0, failed: 1 });
  rejected.delete(telMiembro.endpoint);

  // Un rol revocado deja de recibir los avisos de esa audiencia.
  sent.length = 0;
  await pool.query("UPDATE user_roles SET revoked_at=now() WHERE user_id=$1", [member.userId]);
  assert.equal((await publicar({ title: "Revocado", body: "No le llega.", audience: "members" })).statusCode, 201);
  await settle();
  assert.equal(sent.length, 0);
  await pool.query("UPDATE user_roles SET revoked_at=NULL WHERE user_id=$1", [member.userId]);

  // El texto se recorta por caracteres: un emoji en el borde no queda partido.
  sent.length = 0;
  assert.equal((await publicar({ title: "Emoji", body: "a".repeat(176) + "💪💪💪💪💪", audience: "members" })).statusCode, 201);
  await settle();
  assert.equal(sent[0]?.payload.body, "a".repeat(176) + "💪...");
  const quitar = (headers: Record<string, string>, endpoint: string) => app.inject({ method: "POST", url: "/api/v1/push/subscriptions/remove", headers, payload: { endpoint } });
  assert.equal((await quitar(coach.headers, telMiembro.endpoint)).statusCode, 204);
  assert.equal((await pool.query("SELECT 1 FROM push_subscriptions WHERE endpoint=$1", [telMiembro.endpoint])).rowCount, 1, "otra persona no puede darlo de baja");
  assert.equal((await quitar(member.headers, telMiembro.endpoint)).statusCode, 204);
  assert.equal((await pool.query("SELECT 1 FROM push_subscriptions WHERE endpoint=$1", [telMiembro.endpoint])).rowCount, 0);
});

test("push: sin claves VAPID el servidor no acepta suscripciones y los avisos siguen funcionando", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const plain = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "push-integration-secret-with-more-than-32-characters" });
  const app = await buildApp(plain, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });
  const admin = await actor(pool, "admin");
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/v1/push/config", headers: admin.headers })).json(), { enabled: false, publicKey: null });
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/push/subscriptions", headers: admin.headers, payload: device() })).statusCode, 409);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/announcements", headers: admin.headers, payload: { title: "Sin push", body: "Igual se publica.", audience: "all" } })).statusCode, 201);
});
