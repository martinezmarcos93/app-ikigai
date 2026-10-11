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
const origin = "https://accounts-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "accounts-integration-secret-with-more-than-32-characters"
});

async function sessionFor(pool: pg.Pool, role: "admin" | "member" | "coach", name: string) {
  const inserted = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [`acc-it-${randomUUID()}@example.test`, await hashPassword("clave-inicial-segura-1")]
  );
  const userId = String(inserted.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  if (role === "member") await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active')", [userId, name]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  return { userId, headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) } };
}

test("la administracion crea cuentas con usuario y clave temporal que se debe cambiar", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });
  // El limitador comparte la base entre ejecuciones: sin esto, repetir la prueba en el mismo minuto da 429.
  await pool.query("DELETE FROM rate_limit_buckets");

  const tag = randomUUID().slice(0, 8).replace(/[0-9]/g, "x");   // solo letras: el usuario sale del nombre
  const admin = await sessionFor(pool, "admin", "Administracion");
  const outsider = await sessionFor(pool, "member", "Otra Persona");
  const nuevo = (name: string, table: "member_profiles" | "coach_profiles") => pool.query(
    table === "member_profiles"
      ? "INSERT INTO member_profiles (full_name,status) VALUES ($1,'active') RETURNING id"
      : "INSERT INTO coach_profiles (full_name,discipline) VALUES ($1,'Yoga') RETURNING id", [name]).then((r) => String(r.rows[0]?.id));
  const marcos = await nuevo(`Marcos${tag} Martinez`, "member_profiles");
  const homonimo = await nuevo(`Marcos${tag} Lopez`, "member_profiles");
  const florencia = await nuevo(`Florencia${tag} Moyano`, "coach_profiles");

  // Solo administracion crea cuentas, y con CSRF.
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: outsider.headers, payload: { role: "member", memberId: marcos } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: { ...admin.headers, "x-csrf-token": "x" }, payload: { role: "member", memberId: marcos } })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/admin/accounts", headers: outsider.headers })).statusCode, 403);
  // El rol y el perfil tienen que coincidir.
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "member", coachId: florencia } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "member", memberId: marcos, isAdmin: true } })).statusCode, 400);

  const a = await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "member", memberId: marcos } });
  assert.equal(a.statusCode, 201);
  const username = String(a.json().account.username);
  assert.equal(username, `ikigai-miembro-marcos${tag.toLowerCase()}`);
  const clave = String(a.json().temporaryPassword);
  assert.match(clave, /^MM-Ikigai-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const b = await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "member", memberId: homonimo } });
  assert.equal(b.json().account.username, `ikigai-miembro-marcos${tag.toLowerCase()}-lopez`, "un homonimo recibe el apellido");
  const c = await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "coach", coachId: florencia } });
  assert.equal(c.json().account.username, `ikigai-profesor-florencia${tag.toLowerCase()}`);

  // Una persona no recibe dos cuentas.
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/admin/accounts", headers: admin.headers, payload: { role: "member", memberId: marcos } })).statusCode, 409);

  // La clave no queda en claro ni en la auditoria.
  const stored = await pool.query("SELECT password_hash, must_change_password FROM users WHERE username=$1", [username]);
  assert.notEqual(stored.rows[0]?.password_hash, clave);
  assert.equal(stored.rows[0]?.must_change_password, true);
  const audit = await pool.query("SELECT after_data FROM audit_events WHERE action='user.account_created' AND entity_id=$1", [a.json().account.userId]);
  assert.equal(JSON.stringify(audit.rows[0]?.after_data).includes(clave), false);

  // Entra con el usuario (en mayusculas tambien) y queda obligado a cambiar la clave.
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { login: username.toUpperCase(), password: clave } });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().mustChangePassword, true);
  assert.equal(login.json().user.username, username);
  const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  const csrf = String(login.json().csrfToken);
  const sesion = { origin, cookie, "x-csrf-token": csrf };

  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: sesion })).statusCode, 200);
  const bloqueada = await app.inject({ method: "GET", url: `/api/v1/members/${(await pool.query("SELECT id FROM member_profiles WHERE user_id=$1", [a.json().account.userId])).rows[0]?.id}`, headers: sesion });
  assert.equal(bloqueada.statusCode, 403);
  assert.equal(bloqueada.json().error, "password_change_required");

  // Cambio: la actual tiene que ser correcta, la nueva larga y distinta.
  const cambiar = (currentPassword: string, newPassword: string) => app.inject({ method: "POST", url: "/api/v1/auth/change-password", headers: sesion, payload: { currentPassword, newPassword } });
  assert.equal((await cambiar("incorrecta-incorrecta", "otra-clave-bien-larga-1")).statusCode, 400);
  assert.equal((await cambiar(clave, clave)).statusCode, 400);
  assert.equal((await cambiar(clave, "corta")).statusCode, 400);
  assert.equal((await cambiar(clave, "mi-clave-propia-2026")).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: sesion })).json().mustChangePassword, false);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { login: username, password: clave } })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { login: username, password: "mi-clave-propia-2026" } })).statusCode, 200);

  // Restablecer: nueva clave temporal, sesiones cerradas, vuelve a exigir el cambio. Nunca a un administrador.
  const reset = await app.inject({ method: "POST", url: `/api/v1/admin/accounts/${a.json().account.userId}/reset-password`, headers: admin.headers });
  assert.equal(reset.statusCode, 200);
  assert.match(String(reset.json().temporaryPassword), /^MM-Ikigai-/);
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: sesion })).statusCode, 401, "la sesion anterior se cerro");
  assert.equal((await app.inject({ method: "POST", url: `/api/v1/admin/accounts/${admin.userId}/reset-password`, headers: admin.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/api/v1/admin/accounts/${a.json().account.userId}/reset-password`, headers: outsider.headers })).statusCode, 403);

  const lista = await app.inject({ method: "GET", url: "/api/v1/admin/accounts", headers: admin.headers });
  assert.equal(lista.statusCode, 200);
  assert.ok((lista.json().accounts as Array<{ username: string | null }>).some((x) => x.username === username));
});
