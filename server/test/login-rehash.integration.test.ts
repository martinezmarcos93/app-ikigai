import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { hashPassword, verifyPassword } from "../src/security/password.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://login-rehash.example.com";
const config = loadConfig({
  NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "login-rehash-secret-with-more-than-32-characters"
});

test("PostgreSQL login upgrades a weaker password hash and never on a wrong password", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000, application_name: "ikigai-rehash-it" });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const password = "contrasena-larga-de-prueba-2026";
  const email = `rehash-${randomUUID()}@example.test`;
  const legacyHash = await hashPassword(password, { N: 16_384, r: 8, p: 1 });
  const user = await pool.query("INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id", [email, legacyHash]);
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'admin')", [userId]);
  const login = (candidate: string) => app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { email, password: candidate } });
  const stored = async () => String((await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId])).rows[0]?.password_hash);

  // Una contrasena incorrecta no toca el hash guardado.
  assert.equal((await login("otra-contrasena-larga-1234")).statusCode, 401);
  assert.equal(await stored(), legacyHash);

  // La correcta entra y deja el hash con el costo actual, que sigue verificando la misma contrasena.
  assert.equal((await login(password)).statusCode, 200);
  const upgraded = await stored();
  assert.notEqual(upgraded, legacyHash);
  assert.match(upgraded, /^scrypt\$65536\$8\$2\$/);
  assert.equal(await verifyPassword(password, upgraded), true);
  assert.equal(await verifyPassword("otra-contrasena-larga-1234", upgraded), false);

  // Con el costo actual, entrar de nuevo no lo vuelve a reescribir.
  assert.equal((await login(password)).statusCode, 200);
  assert.equal(await stored(), upgraded);
});
