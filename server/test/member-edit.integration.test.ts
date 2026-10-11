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
const origin = "https://member-edit-integration.example.com";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "member-edit-secret-with-more-than-32-characters" });

test("editar un perfil con datos opcionales vacios los guarda como ausentes y permite quitarlos", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const user = await pool.query("INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'x','local','active') RETURNING id", [`edit-it-${randomUUID()}@example.test`]);
  const adminId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'admin')", [adminId]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [adminId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()]);
  const headers = { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": csrfTokenFor(token, config.sessionSecret) };
  const nuevo = async () => String((await pool.query("INSERT INTO member_profiles (full_name,status) VALUES ($1,'active') RETURNING id", [`Sin correo ${randomUUID()}`])).rows[0]?.id);
  const editar = (id: string, payload: object) => app.inject({ method: "PATCH", url: `/api/v1/members/${id}`, headers, payload });
  const fila = async (id: string) => (await pool.query("SELECT email, phone, address, dni, notes FROM member_profiles WHERE id=$1", [id])).rows[0];

  const a = await nuevo();
  const b = await nuevo();
  // El formulario del portal manda TODOS los campos, tambien los vacios.
  const todoVacio = { email: "", phone: "", address: "", dni: "", emergency_contact_name: "", emergency_contact_phone: "", notes: "" };
  assert.equal((await editar(a, { ...todoVacio, status: "active" })).statusCode, 200);
  assert.equal((await editar(b, { ...todoVacio, status: "active" })).statusCode, 200);
  assert.deepEqual(await fila(a), { email: null, phone: null, address: null, dni: null, notes: null }, "vacio = ausente (NULL), no cadena vacia");

  assert.equal((await editar(a, { email: "Persona@Example.TEST", phone: " 1155550000 " })).statusCode, 200);
  assert.deepEqual((await fila(a)).email, "persona@example.test");
  assert.equal((await fila(a)).phone, "1155550000");
  assert.equal((await editar(a, { email: "" })).statusCode, 200, "se puede quitar el correo");
  assert.equal((await fila(a)).email, null);
  assert.equal((await editar(a, { email: "no-es-un-correo" })).statusCode, 400);
});
