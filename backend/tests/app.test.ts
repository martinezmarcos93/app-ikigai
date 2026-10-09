import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const adminRow = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "admin@example.test",
  password_hash: "test-hash",
  role: "admin",
  member_id: null,
  coach_id: null,
};
const memberRow = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "member@example.test",
  password_hash: "test-hash",
  role: "member",
  member_id: "20000000-0000-4000-8000-000000000001",
  coach_id: null,
};

function makePool(role: "admin" | "member" = "admin") {
  const statements: string[] = [];
  const selectedUser = role === "admin" ? adminRow : memberRow;
  const pool = {
    statements,
    async query(sql: string, _values?: unknown[]) {
      statements.push(sql);
      if (sql.includes("FROM users WHERE email_normalized")) {
        return { rows: [selectedUser], rowCount: 1 };
      }
      if (sql.includes("FROM sessions s")) {
        return {
          rows: [{
            id: selectedUser.id,
            email: selectedUser.email,
            role: selectedUser.role,
            member_id: selectedUser.member_id,
            coach_id: selectedUser.coach_id,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
    async connect() {
      return {
        async query(sql: string, _values?: unknown[]) {
          statements.push(sql);
          if (sql.includes("INSERT INTO members")) {
            return {
              rows: [{
                id: "30000000-0000-4000-8000-000000000001",
                first_name: "Ana",
                last_name: "Pérez",
                email: "ana@example.test",
                status: "trial",
              }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  return pool;
}

function makeConfig() {
  return loadConfig({
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1:3001",
    SESSION_PEPPER: "test-only-pepper",
  });
}

async function login(app: ReturnType<typeof buildApp>, email = "admin@example.test") {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: "http://127.0.0.1:3001" },
    payload: { email, password: "correct-password" },
  });
  assert.equal(response.statusCode, 200);
  const cookieHeader = response.headers["set-cookie"];
  assert.ok(cookieHeader);
  const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  return cookie.split(";")[0];
}

test("health endpoint returns no infrastructure secrets", async () => {
  const pool = makePool() as unknown as Pool;
  const app = buildApp({ pool, config: makeConfig(), passwordVerifier: async () => true });
  const response = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
  await app.close();
});

test("mutating requests reject a missing or untrusted Origin", async () => {
  const app = buildApp({ pool: makePool() as unknown as Pool, config: makeConfig() });
  const missing = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: {} });
  assert.equal(missing.statusCode, 403);
  const foreign = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: "https://attacker.example" },
    payload: {},
  });
  assert.equal(foreign.statusCode, 403);
  await app.close();
});

test("login normalizes email and issues a session cookie", async () => {
  const pool = makePool();
  const app = buildApp({
    pool: pool as unknown as Pool,
    config: makeConfig(),
    passwordVerifier: async (hash, password) => hash === "test-hash" && password === "correct-password",
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: "http://127.0.0.1:3001" },
    payload: { email: "  ADMIN@Example.Test ", password: "correct-password" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["set-cookie"]), /HttpOnly/i);
  assert.match(String(response.headers["set-cookie"]), /SameSite=Strict/i);
  assert.ok(pool.statements.some((sql) => sql.includes("UPDATE users SET last_login_at")));
  await app.close();
});

test("invalid credentials do not reveal whether an email exists", async () => {
  const app = buildApp({
    pool: makePool() as unknown as Pool,
    config: makeConfig(),
    passwordVerifier: async () => false,
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: "http://127.0.0.1:3001" },
    payload: { email: "admin@example.test", password: "wrong" },
  });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "invalid_credentials",
    message: "Email o contraseña incorrectos.",
  });
  await app.close();
});

test("member creation requires a session and admin role, then records an audit event", async () => {
  const adminPool = makePool();
  const adminApp = buildApp({
    pool: adminPool as unknown as Pool,
    config: makeConfig(),
    passwordVerifier: async () => true,
  });
  const unauthenticated = await adminApp.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: { origin: "http://127.0.0.1:3001" },
    payload: { firstName: "Ana", lastName: "Pérez" },
  });
  assert.equal(unauthenticated.statusCode, 401);

  const cookie = await login(adminApp);
  const created = await adminApp.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: { origin: "http://127.0.0.1:3001", cookie },
    payload: { firstName: "Ana", lastName: "Pérez", email: "ANA@example.test" },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().member.first_name, "Ana");
  assert.ok(adminPool.statements.some((sql) => sql.includes("INSERT INTO audit_events")));
  assert.ok(adminPool.statements.includes("COMMIT"));
  await adminApp.close();

  const memberApp = buildApp({
    pool: makePool("member") as unknown as Pool,
    config: makeConfig(),
    passwordVerifier: async () => true,
  });
  const memberCookie = await login(memberApp, "member@example.test");
  const denied = await memberApp.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: { origin: "http://127.0.0.1:3001", cookie: memberCookie },
    payload: { firstName: "Intruso", lastName: "Prueba" },
  });
  assert.equal(denied.statusCode, 403);
  await memberApp.close();
});

test("member creation validates required names before writing", async () => {
  const pool = makePool();
  const app = buildApp({
    pool: pool as unknown as Pool,
    config: makeConfig(),
    passwordVerifier: async () => true,
  });
  const cookie = await login(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: { origin: "http://127.0.0.1:3001", cookie },
    payload: { firstName: " ", lastName: "Pérez" },
  });
  assert.equal(response.statusCode, 400);
  assert.ok(!pool.statements.some((sql) => sql.includes("INSERT INTO members")));
  await app.close();
});