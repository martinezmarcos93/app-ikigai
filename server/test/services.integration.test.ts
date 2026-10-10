import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const userId = "11111111-1111-4111-8111-111111111111";
const token = "test-session-token-services";
const tokenHash = createHash("sha256").update(token).digest("hex");
const origin = "https://app.example.com";
const sessionSecret = "test-session-secret-with-more-than-32-characters";
const csrfToken = csrfTokenFor(token, sessionSecret);

class ServicesDatabase implements TransactionalDatabase {
  constructor(readonly roles: string[]) {}

  async query<Row extends Record<string, unknown>>(
    sql: string,
    values: unknown[] = []
  ): Promise<QueryResult<Row>> {
    let rows: Record<string, unknown>[] = [];

    if (sql.includes("mp.id AS member_id") && sql.includes("FROM sessions s")) {
      if (values[0] === tokenHash) {
        rows = [{
          session_id: "session-id",
          user_id: userId,
          id: userId,
          email: "actor@example.com",
          roles: this.roles,
          member_id: "22222222-2222-4222-8222-222222222222",
          coach_id: null
        }];
      }
    } else if (sql.includes("INSERT INTO services")) {
      rows = [{
        id: "33333333-3333-4333-8333-333333333333",
        name: values[0],
        description: values[1],
        active: true,
        current_price: values[2] ?? null
      }];
    }

    return { rows: rows as Row[], rowCount: rows.length };
  }

  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

async function setup(t: TestContext, db: ServicesDatabase) {
  const app = await buildApp(loadConfig({
    NODE_ENV: "test",
    CORS_ORIGINS: origin,
    SESSION_SECRET: sessionSecret
  }), { db, transactionalDb: db });
  t.after(() => app.close());
  return app;
}

const sessionHeaders = {
  origin,
  cookie: `ikigai_session=${token}`,
  "x-csrf-token": csrfToken
};

test("services API enforces role authorization after valid session and CSRF checks", async (t) => {
  await t.test("administrator can create a service", async (subtest) => {
    const app = await setup(subtest, new ServicesDatabase(["admin"]));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/services",
      headers: sessionHeaders,
      payload: { name: "New Service", currentPrice: "12500.00" }
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().service.name, "New Service");
    assert.equal(response.json().service.current_price, "12500.00");
  });

  await t.test("member with valid CSRF is denied service creation by role", async (subtest) => {
    const app = await setup(subtest, new ServicesDatabase(["member"]));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/services",
      headers: sessionHeaders,
      payload: { name: "Forbidden Service" }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "forbidden");
  });

  await t.test("coach with valid CSRF is denied service creation by role", async (subtest) => {
    const app = await setup(subtest, new ServicesDatabase(["coach"]));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/services",
      headers: sessionHeaders,
      payload: { name: "Forbidden Service" }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "forbidden");
  });

  await t.test("invalid CSRF is rejected before service creation", async (subtest) => {
    const app = await setup(subtest, new ServicesDatabase(["admin"]));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/services",
      headers: { ...sessionHeaders, "x-csrf-token": "invalid-token" },
      payload: { name: "Must Not Be Created" }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "csrf_validation_failed");
  });
});
