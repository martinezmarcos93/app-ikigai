import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const userId = "11111111-1111-4111-8111-111111111111";
const coachId = "44444444-4444-4444-8444-444444444444";
const otherCoachId = "55555555-5555-5555-8555-555555555555";
const token = "test-session-token-coaches";
const tokenHash = createHash("sha256").update(token).digest("hex");
const origin = "https://app.example.com";

class CoachesDatabase implements TransactionalDatabase {
  constructor(
    readonly roles: string[],
    readonly ownCoachId: string | null = null
  ) {}

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
          member_id: null,
          coach_id: this.ownCoachId
        }];
      }
    } else if (sql.includes("FROM coach_profiles")) {
      rows = [{
        id: coachId,
        full_name: "Coach Demo",
        discipline: "Crossfit",
        email: "coach@example.com",
        phone: "1122334455",
        active: true
      }];
    } else if (sql.includes("FROM coach_obligations")) {
      rows = [];
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }

  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

async function setup(t: TestContext, db: CoachesDatabase) {
  const app = await buildApp(loadConfig({
    NODE_ENV: "test",
    CORS_ORIGINS: origin,
    SESSION_SECRET: "test-session-secret-with-more-than-32-characters"
  }), { db, transactionalDb: db });
  t.after(() => app.close());
  return app;
}

const sessionHeaders = { cookie: `ikigai_session=${token}` };

test("only administrators can list all coach profiles", async (t) => {
  const adminApp = await setup(t, new CoachesDatabase(["admin"]));
  const adminRes = await adminApp.inject({
    method: "GET", url: "/api/v1/coaches", headers: sessionHeaders
  });
  assert.equal(adminRes.statusCode, 200);
  assert.equal(adminRes.json().coaches.length, 1);

  const memberApp = await setup(t, new CoachesDatabase(["member"]));
  const memberRes = await memberApp.inject({
    method: "GET", url: "/api/v1/coaches", headers: sessionHeaders
  });
  assert.equal(memberRes.statusCode, 403);
  assert.equal(memberRes.json().error, "forbidden");

  const coachApp = await setup(t, new CoachesDatabase(["coach"], coachId));
  const coachRes = await coachApp.inject({
    method: "GET", url: "/api/v1/coaches", headers: sessionHeaders
  });
  assert.equal(coachRes.statusCode, 403);
});

test("a coach can access only their own obligations and not another coach obligations", async (t) => {
  const coachApp = await setup(t, new CoachesDatabase(["coach"], coachId));

  const ownRes = await coachApp.inject({
    method: "GET", url: `/api/v1/coaches/${coachId}/obligations?period=2026-01`, headers: sessionHeaders
  });
  assert.equal(ownRes.statusCode, 200);

  const otherRes = await coachApp.inject({
    method: "GET", url: `/api/v1/coaches/${otherCoachId}/obligations?period=2026-01`, headers: sessionHeaders
  });
  assert.equal(otherRes.statusCode, 404);
});
