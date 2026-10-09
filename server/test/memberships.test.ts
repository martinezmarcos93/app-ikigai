import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const adminId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const token = "test-membership-session-token";
const tokenHash = createHash("sha256").update(token).digest("hex");
const origin = "https://app.example.com";
const sessionSecret = "test-session-secret-with-more-than-32-characters";

class MembershipDatabase implements Database, TransactionalDatabase {
  readonly statements: string[] = [];
  membership: Record<string, unknown> | null = null;
  readonly roles: string[];
  readonly ownMemberId: string | null;

  constructor(role: "admin" | "member") {
    this.roles = [role];
    this.ownMemberId = role === "member" ? memberId : null;
  }

  async query<Row extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    this.statements.push(sql);
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM sessions s") && sql.includes("array_agg")) {
      if (values[0] === tokenHash) rows = [{
        session_id: "session-id", user_id: adminId, email: "actor@example.test",
        roles: this.roles, member_id: this.ownMemberId, coach_id: null
      }];
    } else if (sql.includes("FROM services") && sql.includes("active=true")) {
      rows = [{ id: serviceId, name: "Funcional", active: true }];
    } else if (sql.includes("INSERT INTO memberships")) {
      this.membership = {
        id: "55555555-5555-4555-8555-555555555555",
        member_id: values[0],
        service_id: values[1],
        starts_on: values[2],
        ends_on: values[3] ?? null,
        billing_period: values[4],
        agreed_price: String(values[5]),
        status: values[6],
        created_at: "2026-10-09T00:00:00.000Z"
      };
      rows = [this.membership];
    } else if (sql.includes("FROM memberships") && sql.includes("WHERE member_id=$1 AND service_id=$2")) {
      if (this.membership && this.membership.member_id === values[0] && this.membership.service_id === values[1]) {
        rows = [this.membership];
      }
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }

  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

async function setup(t: TestContext, db: MembershipDatabase) {
  const app = await buildApp(loadConfig({
    NODE_ENV: "test",
    CORS_ORIGINS: origin,
    SESSION_SECRET: sessionSecret
  }), { db, transactionalDb: db });
  t.after(() => app.close());
  return app;
}

function headers() {
  return {
    origin,
    cookie: `ikigai_session=${token}`,
    "x-csrf-token": csrfTokenFor(token, sessionSecret)
  };
}

test("administrator can create a membership once and repeated matching requests are replayed", async (t) => {
  const db = new MembershipDatabase("admin");
  const app = await setup(t, db);
  const payload = {
    serviceId,
    startsOn: "2026-11-01",
    billingPeriod: "monthly",
    agreedPrice: "45000.00"
  };
  const first = await app.inject({
    method: "POST", url: `/api/v1/members/${memberId}/memberships`,
    headers: headers(), payload
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().membership.agreed_price, "45000.00");
  assert.equal(first.json().replayed, false);
  assert.ok(db.statements.some((sql) => sql.includes("INSERT INTO audit_events")));

  const replay = await app.inject({
    method: "POST", url: `/api/v1/members/${memberId}/memberships`,
    headers: headers(), payload
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().replayed, true);
});

test("members cannot create or change membership contracts", async (t) => {
  const db = new MembershipDatabase("member");
  const app = await setup(t, db);
  const response = await app.inject({
    method: "POST", url: `/api/v1/members/${memberId}/memberships`,
    headers: headers(),
    payload: {
      serviceId,
      startsOn: "2026-11-01",
      billingPeriod: "monthly",
      agreedPrice: "45000.00"
    }
  });
  assert.equal(response.statusCode, 403);
  assert.equal(db.membership, null);
});

test("money validation rejects malformed and excessive precision values", async (t) => {
  const db = new MembershipDatabase("admin");
  const app = await setup(t, db);
  for (const agreedPrice of ["-1", "1.234", "1e6", "99999999999.00"]) {
    const response = await app.inject({
      method: "POST", url: `/api/v1/members/${memberId}/memberships`,
      headers: headers(),
      payload: { serviceId, startsOn: "2026-11-01", billingPeriod: "monthly", agreedPrice }
    });
    assert.equal(response.statusCode, 400, `expected ${agreedPrice} to be rejected`);
  }
  assert.equal(db.membership, null);
});
