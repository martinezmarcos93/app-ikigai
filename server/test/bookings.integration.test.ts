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
const origin = "https://integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

interface TestActor {
  userId: string;
  memberId: string;
  token: string;
  csrfToken: string;
}

async function createActor(pool: pg.Pool, name: string): Promise<TestActor> {
  const email = `it-${randomUUID()}@example.test`;
  const insertedUser = await pool.query(
    `INSERT INTO users (email, password_hash, auth_provider, status)
     VALUES ($1, $2, 'local', 'active')
     RETURNING id`,
    [email, "integration-test-placeholder-hash"]
  );
  const userId = insertedUser.rows[0]?.id as string;
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'member')", [userId]);
  const insertedMember = await pool.query(
    `INSERT INTO member_profiles (user_id, full_name, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [userId, name]
  );
  const memberId = insertedMember.rows[0]?.id as string;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, new Date(Date.now() + 60 * 60 * 1000).toISOString()]
  );
  return {
    userId,
    memberId,
    token,
    csrfToken: csrfTokenFor(token, config.sessionSecret)
  };
}

async function createSession(pool: pg.Pool, templateId: string, startOffsetMinutes: number): Promise<string> {
  const startsAt = new Date(Date.now() + startOffsetMinutes * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  const result = await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot, status)
     VALUES ($1, $2, $3, 1, 'scheduled')
     RETURNING id`,
    [templateId, startsAt.toISOString(), endsAt.toISOString()]
  );
  return result.rows[0]?.id as string;
}

test("PostgreSQL booking transactions serialize capacity and promote the waitlist", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-booking-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const serviceResult = await pool.query(
    "INSERT INTO services (name, active) VALUES ($1, true) RETURNING id",
    [`Integration Service ${suffix}`]
  );
  const serviceId = serviceResult.rows[0]?.id as string;
  const coachResult = await pool.query(
    "INSERT INTO coach_profiles (full_name, discipline, active) VALUES ($1, $2, true) RETURNING id",
    [`Integration Coach ${suffix}`, "Test"]
  );
  const coachId = coachResult.rows[0]?.id as string;
  const templateResult = await pool.query(
    `INSERT INTO class_templates
       (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity, active)
     VALUES ($1, $2, $3, '18:00', 60, 1, true)
     RETURNING id`,
    [serviceId, coachId, new Date().getUTCDay()]
  );
  const templateId = templateResult.rows[0]?.id as string;
  const futureSessionId = await createSession(pool, templateId, 180);
  const nearSessionId = await createSession(pool, templateId, 30);
  const first = await createActor(pool, `Integration Member A ${suffix}`);
  const second = await createActor(pool, `Integration Member B ${suffix}`);

  const profilePatch = await app.inject({
    method: "PATCH",
    url: `/api/v1/members/${first.memberId}`,
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken
    },
    payload: { phone: "1198765432", emergency_contact_name: "Emergency Test" }
  });
  assert.equal(profilePatch.statusCode, 200);
  assert.equal(profilePatch.json().member.phone, "1198765432");
  assert.equal(profilePatch.json().member.dni, undefined);

  const forbiddenProfilePatch = await app.inject({
    method: "PATCH",
    url: `/api/v1/members/${first.memberId}`,
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken
    },
    payload: { status: "suspended" }
  });
  assert.equal(forbiddenProfilePatch.statusCode, 403);

  const profileAudit = await pool.query(
    "SELECT count(*)::int AS total FROM audit_events WHERE action = 'member.profile_updated' AND entity_id = $1",
    [first.memberId]
  );
  assert.equal(profileAudit.rows[0]?.total, 1);

  async function book(actor: TestActor, sessionId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/class-sessions/${sessionId}/bookings`,
      headers: {
        origin,
        cookie: `ikigai_session=${actor.token}`,
        "x-csrf-token": actor.csrfToken
      }
    });
  }

  const [firstResponse, secondResponse] = await Promise.all([
    book(first, futureSessionId),
    book(second, futureSessionId)
  ]);
  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 201);
  const firstBooking = firstResponse.json().booking as { id: string; status: string };
  const secondBooking = secondResponse.json().booking as { id: string; status: string };
  assert.deepEqual(
    [firstBooking.status, secondBooking.status].sort(),
    ["confirmed", "waitlist"]
  );

  const duplicateActor = firstBooking.status === "confirmed" ? first : second;
  const duplicate = await book(duplicateActor, futureSessionId);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error, "booking_already_exists");

  const confirmedActor = firstBooking.status === "confirmed" ? first : second;
  const confirmedBooking = firstBooking.status === "confirmed" ? firstBooking : secondBooking;
  const waitingBooking = firstBooking.status === "waitlist" ? firstBooking : secondBooking;
  const cancellation = await app.inject({
    method: "POST",
    url: `/api/v1/bookings/${confirmedBooking.id}/cancel`,
    headers: {
      origin,
      cookie: `ikigai_session=${confirmedActor.token}`,
      "x-csrf-token": confirmedActor.csrfToken
    }
  });
  assert.equal(cancellation.statusCode, 200);
  assert.equal(cancellation.json().booking.promotedBooking.id, waitingBooking.id);

  const counts = await pool.query(
    "SELECT status, count(*)::int AS total FROM bookings WHERE session_id = $1 GROUP BY status",
    [futureSessionId]
  );
  const statusCounts = Object.fromEntries(counts.rows.map((row) => [row.status, row.total]));
  assert.equal(statusCounts.confirmed, 1);
  assert.equal(statusCounts.waitlist, undefined);
  assert.equal(statusCounts.cancelled, 1);

  const audit = await pool.query(
    `SELECT action FROM audit_events
      WHERE entity_type = 'booking' AND entity_id = ANY($1::text[])`,
    [[firstBooking.id, secondBooking.id]]
  );
  assert.deepEqual(
    audit.rows.map((row) => row.action).sort(),
    ["booking.cancelled", "booking.created", "booking.created", "booking.waitlist_promoted"].sort()
  );

  const tooLate = await book(first, nearSessionId);
  assert.equal(tooLate.statusCode, 409);
  assert.equal(tooLate.json().error, "booking_cutoff_passed");
  const lateSessionCount = await pool.query(
    "SELECT count(*)::int AS total FROM bookings WHERE session_id = $1",
    [nearSessionId]
  );
  assert.equal(lateSessionCount.rows[0]?.total, 0);
});
