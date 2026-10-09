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
const origin = "https://attendance-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "admin" | "member") {
  const email = `attendance-it-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  const profile = await pool.query(
    "INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id",
    [userId, name]
  );
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return {
    userId,
    memberId: String(profile.rows[0]?.id),
    token,
    csrfToken: csrfTokenFor(token, config.sessionSecret)
  };
}

async function createCoachActor(pool: pg.Pool, name: string) {
  const email = `attendance-coach-${randomUUID()}@example.test`;
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,'coach')", [userId]);
  const profile = await pool.query(
    "INSERT INTO coach_profiles (user_id,full_name,discipline,active) VALUES ($1,$2,'Test',true) RETURNING id",
    [userId, name]
  );
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return {
    userId,
    coachId: String(profile.rows[0]?.id),
    token,
    csrfToken: csrfTokenFor(token, config.sessionSecret)
  };
}

function headers(actor: { token: string; csrfToken: string }) {
  return {
    origin,
    cookie: `ikigai_session=${actor.token}`,
    "x-csrf-token": actor.csrfToken
  };
}

test("PostgreSQL attendance is historical, correctable, and scoped to the member", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-attendance-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Attendance Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Attendance Member ${suffix}`, "member");
  const other = await createActor(pool, `Other Attendance Member ${suffix}`, "member");
  const service = await pool.query(
    "INSERT INTO services (name,active) VALUES ($1,true) RETURNING id",
    [`Attendance Service ${suffix}`]
  );
  const coachActor = await createCoachActor(pool, `Attendance Coach ${suffix}`);
  const otherCoach = await createCoachActor(pool, `Other Attendance Coach ${suffix}`);
  const template = await pool.query(
    `INSERT INTO class_templates (service_id,coach_id,weekday,local_start_time,duration_minutes,capacity,active)
     VALUES ($1,$2,$3,'18:00',60,10,true) RETURNING id`,
    [service.rows[0]?.id, coachActor.coachId, new Date().getUTCDay()]
  );
  const startsAt = new Date(Date.now() - 60 * 60_000);
  const endsAt = new Date(Date.now() - 30 * 60_000);
  const session = await pool.query(
    `INSERT INTO class_sessions (template_id,starts_at,ends_at,capacity_snapshot,status)
     VALUES ($1,$2,$3,10,'completed') RETURNING id`,
    [template.rows[0]?.id, startsAt.toISOString(), endsAt.toISOString()]
  );
  const sessionId = String(session.rows[0]?.id);
  const booking = await pool.query(
    "INSERT INTO bookings (session_id,member_id,status) VALUES ($1,$2,'confirmed') RETURNING id",
    [sessionId, member.memberId]
  );
  const bookingId = String(booking.rows[0]?.id);

  const recorded = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(admin),
    payload: { records: [{ bookingId, attended: true }] }
  });
  assert.equal(recorded.statusCode, 200);
  assert.equal(recorded.json().created, 1);
  assert.equal(recorded.json().updated, 0);

  const sameValue = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(admin),
    payload: { records: [{ bookingId, attended: true }] }
  });
  assert.equal(sameValue.statusCode, 200);
  assert.equal(sameValue.json().unchanged, 1);

  const corrected = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(admin),
    payload: { records: [{ bookingId, attended: false }] }
  });
  assert.equal(corrected.statusCode, 200);
  assert.equal(corrected.json().updated, 1);

  const memberHistory = await app.inject({
    method: "GET",
    url: `/api/v1/members/${member.memberId}/attendance`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(memberHistory.statusCode, 200);
  assert.equal(memberHistory.json().records.length, 1);
  assert.equal(memberHistory.json().records[0].attended, false);

  const crossMemberHistory = await app.inject({
    method: "GET",
    url: `/api/v1/members/${other.memberId}/attendance`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(crossMemberHistory.statusCode, 404);

  const memberWrite = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(member),
    payload: { records: [{ bookingId, attended: true }] }
  });
  assert.equal(memberWrite.statusCode, 404);

  const assignedCoachRead = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: { cookie: `ikigai_session=${coachActor.token}` }
  });
  assert.equal(assignedCoachRead.statusCode, 200);

  const assignedCoachWrite = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(coachActor),
    payload: { records: [{ bookingId, attended: false }] }
  });
  assert.equal(assignedCoachWrite.statusCode, 200);
  assert.equal(assignedCoachWrite.json().unchanged, 1);

  const otherCoachRead = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: { cookie: `ikigai_session=${otherCoach.token}` }
  });
  assert.equal(otherCoachRead.statusCode, 404);

  const otherCoachWrite = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${sessionId}/attendance`,
    headers: headers(otherCoach),
    payload: { records: [{ bookingId, attended: true }] }
  });
  assert.equal(otherCoachWrite.statusCode, 404);

  const records = await pool.query("SELECT count(*)::int AS total, bool_and(attended) AS all_attended FROM attendance_records WHERE booking_id=$1", [bookingId]);
  assert.equal(records.rows[0]?.total, 1);
  assert.equal(records.rows[0]?.all_attended, false);

  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_type='attendance_record' AND entity_id=(SELECT id::text FROM attendance_records WHERE booking_id=$1) ORDER BY action",
    [bookingId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ["attendance.corrected", "attendance.recorded"]);
});
