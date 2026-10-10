import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Database, QueryResult } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const userId = "11111111-1111-4111-8111-111111111111";
const token = "test-session-token-members";
const tokenHash = createHash("sha256").update(token).digest("hex");
const origin = "https://app.example.com";

class MembersDatabase implements Database {
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
    } else if (sql.includes("FROM member_profiles")) {
        rows = [{ id: "22222222-2222-4222-8222-222222222222", full_name: "Test Member" }];
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }
}

async function setup(t: TestContext, db: MembersDatabase) {
  const app = await buildApp(loadConfig({
    NODE_ENV: "test",
    CORS_ORIGINS: origin,
    SESSION_SECRET: "test-session-secret-with-more-than-32-characters"
  }), { db });
  t.after(() => app.close());
  return app;
}

const sessionHeaders = { cookie: `ikigai_session=${token}` };

test("member API access control", async (t) => {
  await t.test("only admins can list all members", async () => {
    const adminApp = await setup(t, new MembersDatabase(["admin"]));
    const res = await adminApp.inject({ method: "GET", url: "/api/v1/members", headers: sessionHeaders });
    assert.equal(res.statusCode, 200);

    const memberApp = await setup(t, new MembersDatabase(["member"]));
    const res2 = await memberApp.inject({ method: "GET", url: "/api/v1/members", headers: sessionHeaders });
    assert.equal(res2.statusCode, 403);
  });
});
