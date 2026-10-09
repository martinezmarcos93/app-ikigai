import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Database, QueryResult } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { hashPassword } from "../src/security/password.js";

interface FakeSession {
  id: string;
  userId: string;
  tokenHash: string;
  revoked: boolean;
  expiresAt: string;
}

class FakeDatabase implements Database {
  readonly user: { id: string; email: string; password_hash: string; status: string };
  readonly roles = ["admin"];
  readonly sessions: FakeSession[] = [];
  readonly rateLimitHits = new Map<string, number>();

  constructor(user: { id: string; email: string; password_hash: string; status?: string }) {
    this.user = { ...user, status: user.status ?? "active" };
  }

  async query<Row extends Record<string, unknown>>(
    sql: string,
    values: unknown[] = []
  ): Promise<QueryResult<Row>> {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("INSERT INTO auth_rate_limit_buckets")) {
      const key = String(values[0]);
      const hits = (this.rateLimitHits.get(key) ?? 0) + 1;
      this.rateLimitHits.set(key, hits);
      rows = [{ hits, retry_after_seconds: 60 }];
    } else if (sql.includes("FROM users") && sql.includes("password_hash")) {
      if (values[0] === this.user.email && this.user.status === "active") {
        rows = [{ id: this.user.id, email: this.user.email, password_hash: this.user.password_hash }];
      }
    } else if (sql.includes("SELECT role FROM user_roles")) {
      rows = this.roles.map((role) => ({ role }));
    } else if (sql.includes("INSERT INTO sessions")) {
      this.sessions.push({
        id: "session-" + (this.sessions.length + 1),
        userId: String(values[0]),
        tokenHash: String(values[1]),
        expiresAt: String(values[2]),
        revoked: false
      });
    } else if (sql.includes("FROM sessions s")) {
      const session = this.sessions.find((item) =>
        item.tokenHash === values[0] && !item.revoked && Date.parse(item.expiresAt) > Date.now()
      );
      if (session && session.userId === this.user.id && this.user.status === "active") {
        rows = [{
          session_id: session.id,
          id: this.user.id,
          email: this.user.email,
          roles: this.roles
        }];
      }
    } else if (sql.includes("UPDATE sessions SET revoked_at")) {
      const session = this.sessions.find((item) => item.id === values[0]);
      if (session) session.revoked = true;
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }
}

const origin = "https://app.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "test-session-secret-with-more-than-32-characters"
});
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function setup(t: TestContext) {
  const password = "test-admin-password-2026";
  const db = new FakeDatabase({
    id: "user-1",
    email: "admin@example.com",
    password_hash: await hashPassword(password)
  });
  const app = await buildApp(config, { db });
  t.after(() => app.close());
  return { app, db, password };
}

test("login creates an opaque HttpOnly session and returns role plus CSRF token", async (t) => {
  const { app, db, password } = await setup(t);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email: "ADMIN@example.com", password }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.user, { id: "user-1", email: "admin@example.com", roles: ["admin"], memberId: null, coachId: null });
  assert.equal(typeof body.csrfToken, "string");
  assert.ok(response.headers["set-cookie"]);
  const cookies = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(cookies) ? cookies.join(";") : String(cookies);
  assert.match(cookieHeader, /ikigai_session=/);
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Strict/i);
  assert.equal(db.sessions.length, 1);
  const rawToken = /ikigai_session=([^;]+)/.exec(cookieHeader)?.[1];
  assert.ok(rawToken);
  assert.notEqual(db.sessions[0]?.tokenHash, rawToken);
  assert.equal(db.sessions[0]?.tokenHash, digest(decodeURIComponent(rawToken)));
});

test("login rejects requests without an allowed browser origin", async (t) => {
  const { app, password } = await setup(t);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@example.com", password }
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "origin_not_allowed");
});

test("wrong credentials do not create a session", async (t) => {
  const { app, db } = await setup(t);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email: "admin@example.com", password: "wrong-password-2026" }
  });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "invalid_credentials",
    message: "Email or password is incorrect."
  });
  assert.equal(db.sessions.length, 0);
});

test("session introspection and CSRF-protected logout revoke the session", async (t) => {
  const { app, password } = await setup(t);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email: "admin@example.com", password }
  });
  assert.equal(login.statusCode, 200);
  const body = login.json();
  const cookies = login.headers["set-cookie"];
  const cookieHeader = Array.isArray(cookies) ? cookies.join(";") : String(cookies);
  const token = /ikigai_session=([^;]+)/.exec(cookieHeader)?.[1];
  assert.ok(token);

  const me = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { cookie: `ikigai_session=${token}` }
  });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json().user, body.user);
  assert.equal(me.json().csrfToken, body.csrfToken);

  const rejectedLogout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": "wrong" }
  });
  assert.equal(rejectedLogout.statusCode, 403);

  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { origin, cookie: `ikigai_session=${token}`, "x-csrf-token": body.csrfToken }
  });
  assert.equal(logout.statusCode, 204);

  const afterLogout = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { cookie: `ikigai_session=${token}` }
  });
  assert.equal(afterLogout.statusCode, 401);
});


test("login throttles repeated failures using a shared per-email counter", async (t) => {
  const { app, db } = await setup(t);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin },
      payload: { email: "admin@example.com", password: "incorrect-password-2026" }
    });
    assert.equal(response.statusCode, 401);
  }
  const limited = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email: "admin@example.com", password: "incorrect-password-2026" }
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal(limited.json().error, "too_many_attempts");
  assert.equal(db.sessions.length, 0);
});
