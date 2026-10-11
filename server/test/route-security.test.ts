import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp, PUBLIC_ROUTES as PUBLIC } from "../src/app.js";
import type { InjectOptions } from "fastify";
import { loadConfig } from "../src/config.js";
import { csrfTokenFor } from "../src/security/csrf.js";

// Auditoria automatica de la matriz de autorizacion (docs/SECURITY_ROUTE_MATRIX.md):
// enumera TODAS las rutas registradas en el servidor y comprueba, sin base de datos,
//   1. que cada ruta privada rechaza al anonimo,
//   2. que cada ruta "solo administracion" rechaza a un miembro y a un profesor,
//   3. que toda ruta registrada figura en la matriz documentada (y viceversa).

const origin = "https://app.example.com";
const secret = "test-session-secret-with-more-than-32-characters";
const sessionToken = "route-security-session-token";
const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

class FakeDatabase implements TransactionalDatabase {
  constructor(readonly roles: string[]) {}
  async query<Row extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM sessions s") && values[0] === tokenHash) {
      rows = [{
        session_id: "session-id", user_id: randomUUID(), id: randomUUID(), email: "actor@example.com",
        roles: this.roles, member_id: this.roles.includes("member") ? randomUUID() : null,
        coach_id: this.roles.includes("coach") ? randomUUID() : null
      }];
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }
  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

const normalize = (url: string) => url.replace(/:[A-Za-z_]+/g, ":p");
const concrete = (url: string) => url.replace(/:[A-Za-z_]+/g, () => randomUUID());

async function build(roles: string[] | null) {
  const routes: { method: string; url: string }[] = [];
  const db = new FakeDatabase(roles ?? []);
  const app = await buildApp(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: secret }), {
    db, transactionalDb: db, onRoute: (r) => routes.push(r)
  });
  return { app, routes };
}

async function readMatrix() {
  const text = await readFile(new URL("../../docs/SECURITY_ROUTE_MATRIX.md", import.meta.url), "utf8");
  const rows = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^\| `([A-Z]+) (\/[^`]*)` \| ([^|]*) \|/);
    if (m) rows.set(`${m[1]} ${normalize(m[2]!)}`, m[3]!.trim());
  }
  return rows;
}

function request(op: { method: string; url: string }, headers: Record<string, string>): InjectOptions {
  const options: InjectOptions = { url: concrete(op.url), headers, ...(op.method ? { method: op.method as NonNullable<InjectOptions["method"]> } : {}) };
  if (op.method !== "GET") options.payload = {};
  return options;
}

function operations(routes: { method: string; url: string }[]) {
  return routes
    .filter((r) => !["HEAD", "OPTIONS"].includes(r.method))
    .map((r) => ({ key: `${r.method} ${normalize(r.url)}`, method: r.method, url: r.url }));
}

test("toda ruta registrada esta documentada en la matriz de autorizacion, y viceversa", async (t) => {
  const { app, routes } = await build(null);
  t.after(() => app.close());
  const matrix = await readMatrix();
  const registered = new Set(operations(routes).map((o) => o.key).filter((k) => !PUBLIC.has(k)));
  const missing = [...registered].filter((k) => !matrix.has(k));
  assert.deepEqual(missing, [], `rutas sin fila en docs/SECURITY_ROUTE_MATRIX.md: ${missing.join(", ")}`);
  const stale = [...matrix.keys()].filter((k) => !operations(routes).some((o) => o.key === k));
  assert.deepEqual(stale, [], `filas de la matriz sin ruta en el servidor: ${stale.join(", ")}`);
});

test("ninguna ruta privada responde a un anonimo", async (t) => {
  const { app, routes } = await build(null);
  t.after(() => app.close());
  const leaks: string[] = [];
  for (const op of operations(routes)) {
    if (PUBLIC.has(op.key)) continue;
    const res = await app.inject(request(op, { origin }));
    if (![401, 403].includes(res.statusCode)) leaks.push(`${op.key} -> ${res.statusCode}`);
  }
  assert.deepEqual(leaks, [], `rutas privadas que no rechazan al anonimo: ${leaks.join("; ")}`);
});

for (const role of ["member", "coach"]) {
  test(`las rutas solo-administracion rechazan a un ${role} con sesion y CSRF validos`, async (t) => {
    const { app, routes } = await build([role]);
    t.after(() => app.close());
    const matrix = await readMatrix();
    const headers = { origin, cookie: `ikigai_session=${sessionToken}`, "x-csrf-token": csrfTokenFor(sessionToken, secret) };
    const adminOnly = operations(routes).filter((o) => matrix.get(o.key) === "Administración");
    assert.ok(adminOnly.length >= 20, `se esperaban muchas rutas solo-administracion (hay ${adminOnly.length})`);
    const breaches: string[] = [];
    for (const op of adminOnly) {
      const res = await app.inject(request(op, headers));
      if (res.statusCode < 400 || res.statusCode >= 500 || res.statusCode === 404) breaches.push(`${op.key} -> ${res.statusCode}`);
    }
    assert.deepEqual(breaches, [], `un ${role} no deberia pasar de la autorizacion en: ${breaches.join("; ")}`);
  });
}
