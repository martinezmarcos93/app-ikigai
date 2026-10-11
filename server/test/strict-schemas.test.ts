import test from "node:test";
import assert from "node:assert/strict";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

// «La validación de esquema rechaza propiedades desconocidas» (matriz de autorización). Fastify, por defecto, las elimina
// en silencio en lugar de rechazarlas; la aplicación lo desactiva (removeAdditional: false). Estas pruebas lo sostienen:
// el comportamiento (400 ante un campo de más) y la forma (todo objeto de un esquema de cuerpo es estricto).

const origin = "https://app.example.com";

class NullDatabase implements TransactionalDatabase {
  async query<Row extends Record<string, unknown>>(): Promise<QueryResult<Row>> { return { rows: [], rowCount: 0 }; }
  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> { return work(this); }
}

async function build(routes: { method: string; url: string; schema?: unknown }[] = []) {
  const db = new NullDatabase();
  return buildApp(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "strict-schemas-secret-with-more-than-32-characters" }), {
    db, transactionalDb: db, onRoute: (route) => routes.push(route)
  });
}

test("un campo de mas en el cuerpo se rechaza con 400 y no se descarta en silencio", async (t) => {
  const app = await build();
  t.after(() => app.close());
  const cases: [string, Record<string, unknown>][] = [
    ["/api/v1/auth/login", { email: "a@b.co", password: "x".repeat(12), role: "admin", isAdmin: true }],
    ["/api/v1/auth/password-reset/request", { email: "a@b.co", role: "admin" }],
    ["/api/v1/auth/accept-invitation", { token: "A".repeat(43), password: "x".repeat(12), roles: ["admin"] }]
  ];
  for (const [url, payload] of cases) {
    const res = await app.inject({ method: "POST", url, headers: { origin }, payload });
    assert.equal(res.statusCode, 400, `${url} acepto propiedades desconocidas (${res.statusCode}): ${res.body.slice(0, 120)}`);
    assert.match(res.json().message, /additional properties/);
  }
});

function lax(schema: unknown, path: string): string[] {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  const problems: string[] = [];
  if (node.type === "object" && node.properties !== undefined && node.additionalProperties !== false) problems.push(path);
  for (const [name, child] of Object.entries((node.properties ?? {}) as Record<string, unknown>)) problems.push(...lax(child, `${path}.${name}`));
  if (node.items) problems.push(...lax(node.items, `${path}[]`));
  return problems;
}

test("todo objeto de un esquema de cuerpo declara additionalProperties: false", async (t) => {
  const routes: { method: string; url: string; schema?: unknown }[] = [];
  const app = await build(routes);
  t.after(() => app.close());
  const withBody = routes.filter((r) => (r.schema as { body?: unknown } | undefined)?.body);
  assert.ok(withBody.length >= 25, `se esperaban muchas rutas con cuerpo validado (hay ${withBody.length})`);
  const loose = withBody.flatMap((r) => lax((r.schema as { body: unknown }).body, `${r.method} ${r.url} body`));
  assert.deepEqual(loose, [], `esquemas de cuerpo que aceptan propiedades desconocidas: ${loose.join("; ")}`);
});
