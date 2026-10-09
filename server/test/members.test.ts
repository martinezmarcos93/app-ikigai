import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Database, QueryResult } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const adminId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const otherMemberId = "33333333-3333-4333-8333-333333333333";
const coachId = "44444444-4444-4444-8444-444444444444";
const token = "test-session-token-that-is-not-a-real-secret";
const tokenHash = createHash("sha256").update(token).digest("hex");
const origin = "https://app.example.com";

interface Profile extends Record<string, unknown> {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  dni: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
  joined_on: string | null;
  exited_on: string | null;
  notes: string | null;
}

class MembersDatabase implements Database {
  readonly profile: Profile = {
    id: memberId,
    full_name: "Miembro Demo",
    email: "member@example.com",
    phone: "1112345678",
    address: "Calle de prueba",
    dni: "12345678",
    emergency_contact_name: "Contacto Demo",
    emergency_contact_phone: "1199999999",
    status: "active",
    joined_on: "2026-01-01",
    exited_on: null,
    notes: "Nota interna confidencial"
  };

  constructor(
    readonly roles: string[],
    readonly ownMemberId: string | null,
    readonly ownCoachId: string | null,
    readonly coachScope = false
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
          user_id: adminId,
          id: adminId,
          email: "actor@example.com",
          roles: this.roles,
          member_id: this.ownMemberId,
          coach_id: this.ownCoachId
        }];
      }
    } else if (sql.includes("SELECT EXISTS (")) {
      rows = [{ allowed: this.coachScope }];
    } else if (sql.includes("count(*)::int AS total")) {
      rows = [{ total: 1 }];
    } else if (sql.includes("ORDER BY lower(full_name)")) {
      rows = [{
        id: memberId, full_name: this.profile.full_name, email: this.profile.email,
        phone: this.profile.phone, status: this.profile.status,
        joined_on: this.profile.joined_on, exited_on: this.profile.exited_on
      }];
    } else if (sql.includes("FROM member_profiles") && sql.includes("WHERE id = $1")) {
      if (values[0] === memberId) rows = [this.profile];
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

test("only administrators can list member profiles", async (t) => {
  const admin = await setup(t, new MembersDatabase(["admin"], null, null));
  const allowed = await admin.inject({
    method: "GET", url: "/api/v1/members?limit=10&offset=0", headers: sessionHeaders
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().items.length, 1);

  const memberApp = await setup(t, new MembersDatabase(["member"], memberId, null));
  const denied = await memberApp.inject({
    method: "GET", url: "/api/v1/members", headers: sessionHeaders
  });
  assert.equal(denied.statusCode, 403);
});

test("a member can read only their own profile and cannot see internal notes or DNI", async (t) => {
  const app = await setup(t, new MembersDatabase(["member"], memberId, null));
  const own = await app.inject({
    method: "GET", url: `/api/v1/members/${memberId}`, headers: sessionHeaders
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().member.id, memberId);
  assert.equal("dni" in own.json().member, false);
  assert.equal("notes" in own.json().member, false);

  const other = await app.inject({
    method: "GET", url: `/api/v1/members/${otherMemberId}`, headers: sessionHeaders
  });
  assert.equal(other.statusCode, 404);
});

test("a coach can read only assigned members and receives a minimized profile", async (t) => {
  const allowedApp = await setup(t, new MembersDatabase(["coach"], null, coachId, true));
  const allowed = await allowedApp.inject({
    method: "GET", url: `/api/v1/members/${memberId}`, headers: sessionHeaders
  });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(Object.keys(allowed.json().member).sort(), [
    "emergency_contact_name", "emergency_contact_phone", "full_name", "id", "phone", "status"
  ].sort());

  const deniedApp = await setup(t, new MembersDatabase(["coach"], null, coachId, false));
  const denied = await deniedApp.inject({
    method: "GET", url: `/api/v1/members/${memberId}`, headers: sessionHeaders
  });
  assert.equal(denied.statusCode, 404);
});

test("unauthenticated callers cannot read member data", async (t) => {
  const app = await setup(t, new MembersDatabase(["admin"], null, null));
  const response = await app.inject({ method: "GET", url: `/api/v1/members/${memberId}` });
  assert.equal(response.statusCode, 401);
});
