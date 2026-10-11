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
const origin = "https://announcements-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "announcements-integration-secret-with-more-than-32-characters"
});

async function actor(pool: pg.Pool, role: "admin" | "member" | "coach") {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-placeholder-hash','local','active') RETURNING id",
    [`ann-it-${randomUUID()}@example.test`]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let profileId: string | null = null;
  if (role === "member") profileId = String((await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,'Socia aviso','active') RETURNING id", [userId])).rows[0]?.id);
  if (role === "coach") profileId = String((await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline) VALUES ($1,'Profe aviso','Test') RETURNING id", [userId])).rows[0]?.id);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  return { userId, profileId, headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) } };
}

test("avisos: administracion publica, cada rol ve lo suyo, se marcan como leidos y se archivan", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });
  await pool.query("DELETE FROM rate_limit_buckets");
  await pool.query("UPDATE announcements SET archived_at = now() WHERE archived_at IS NULL");   // lista limpia para contar

  const admin = await actor(pool, "admin");
  const member = await actor(pool, "member");
  const coach = await actor(pool, "coach");
  const publicar = (headers: Record<string, string>, payload: unknown) => app.inject({ method: "POST", url: "/api/v1/admin/announcements", headers, payload: payload as object });
  const ver = async (who: { headers: Record<string, string> }) => (await app.inject({ method: "GET", url: "/api/v1/announcements", headers: who.headers })).json();

  // Solo administracion publica; el cuerpo es estricto.
  assert.equal((await publicar(member.headers, { title: "x", body: "y", audience: "all" })).statusCode, 403);
  assert.equal((await publicar(coach.headers, { title: "x", body: "y", audience: "all" })).statusCode, 403);
  assert.equal((await publicar({ ...admin.headers, "x-csrf-token": "x" }, { title: "x", body: "y", audience: "all" })).statusCode, 403);
  assert.equal((await publicar(admin.headers, { title: "x", body: "y", audience: "everyone" })).statusCode, 400);
  assert.equal((await publicar(admin.headers, { title: "x", body: "y", audience: "all", pinned: true })).statusCode, 400);
  assert.equal((await publicar(admin.headers, { title: "   ", body: "y", audience: "all" })).statusCode, 400);

  const general = (await publicar(admin.headers, { title: "Feriado", body: "El lunes no hay clases.", audience: "all" })).json().announcement;
  const soloMiembros = (await publicar(admin.headers, { title: "Cuota", body: "Recordatorio de cuota.", audience: "members" })).json().announcement;
  const soloProfes = (await publicar(admin.headers, { title: "Reunion", body: "Reunion de profesores el jueves.", audience: "coaches" })).json().announcement;

  const titulos = async (who: { headers: Record<string, string> }) => (await ver(who)).announcements.map((a: { title: string }) => a.title).sort();
  assert.deepEqual(await titulos(member), ["Cuota", "Feriado"]);
  assert.deepEqual(await titulos(coach), ["Feriado", "Reunion"]);
  assert.deepEqual(await titulos(admin), ["Cuota", "Feriado", "Reunion"]);
  assert.equal((await ver(member)).unread, 2);

  // Leer: solo lo que le corresponde, idempotente, y por persona.
  const leer = (who: { headers: Record<string, string> }, id: string) => app.inject({ method: "POST", url: `/api/v1/announcements/${id}/read`, headers: who.headers });
  assert.equal((await leer(member, soloProfes.id)).statusCode, 404, "un miembro no puede tocar un aviso de profesores");
  assert.equal((await leer(member, general.id)).statusCode, 204);
  assert.equal((await leer(member, general.id)).statusCode, 204);
  assert.equal((await ver(member)).unread, 1);
  assert.equal((await ver(coach)).unread, 2, "la lectura de otra persona no cuenta");
  assert.equal((await app.inject({ method: "POST", url: `/api/v1/announcements/${general.id}/read`, headers: { ...member.headers, "x-csrf-token": "x" } })).statusCode, 403);

  // La auditoria guarda los destinatarios, no el texto.
  const audit = await pool.query("SELECT after_data FROM audit_events WHERE action='announcement.published' AND entity_id=$1", [general.id]);
  assert.deepEqual(audit.rows[0]?.after_data, { audience: "all" });

  // Archivar: solo administracion; deja de verse para todos y no se puede leer.
  const archivar = (who: { headers: Record<string, string> }, id: string) => app.inject({ method: "POST", url: `/api/v1/admin/announcements/${id}/archive`, headers: who.headers });
  assert.equal((await archivar(member, soloMiembros.id)).statusCode, 403);
  assert.equal((await archivar(admin, soloMiembros.id)).statusCode, 204);
  assert.equal((await archivar(admin, soloMiembros.id)).statusCode, 404);
  assert.deepEqual(await titulos(member), ["Feriado"]);
  assert.equal((await leer(member, soloMiembros.id)).statusCode, 404);
});

test("el profesor lista solo los miembros con quienes tiene clases", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const coach = await actor(pool, "coach");
  const otherCoach = await actor(pool, "coach");
  const member = await actor(pool, "member");
  const service = String((await pool.query("INSERT INTO services (name) VALUES ($1) RETURNING id", [`Servicio ${randomUUID()}`])).rows[0]?.id);
  const template = async (coachId: string) => String((await pool.query(
    "INSERT INTO class_templates (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity) VALUES ($1,$2,1,'19:00',60,10) RETURNING id", [service, coachId])).rows[0]?.id);
  const miPlantilla = await template(coach.profileId!);
  await template(otherCoach.profileId!);
  const lista = async (who: { headers: Record<string, string> }) => app.inject({ method: "GET", url: "/api/v1/coach/members", headers: who.headers });

  assert.equal((await lista(member)).statusCode, 403);
  assert.deepEqual((await lista(coach)).json().members, []);
  await pool.query("INSERT INTO recurring_assignments (template_id, member_id, starts_on, created_by) VALUES ($1,$2,CURRENT_DATE,$3)", [miPlantilla, member.profileId, coach.userId]);
  assert.deepEqual((await lista(coach)).json().members.map((m: { id: string }) => m.id), [member.profileId]);
  assert.deepEqual((await lista(otherCoach)).json().members, [], "otro profesor no ve a ese miembro");
});
