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

async function createActor(pool: pg.Pool, name: string, role: "member" | "admin" = "member"): Promise<TestActor> {
  const email = `it-${randomUUID()}@example.test`;
  const insertedUser = await pool.query(
    `INSERT INTO users (email, password_hash, auth_provider, status)
     VALUES ($1, $2, 'local', 'active')
     RETURNING id`,
    [email, "integration-test-placeholder-hash"]
  );
  const userId = insertedUser.rows[0]?.id as string;
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, role]);
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

interface TestCoachActor {
  userId: string;
  coachId: string;
  token: string;
  csrfToken: string;
}

async function createCoachActor(pool: pg.Pool, name: string): Promise<TestCoachActor> {
  const email = `it-coach-${randomUUID()}@example.test`;
  const insertedUser = await pool.query(
    `INSERT INTO users (email, password_hash, auth_provider, status)
     VALUES ($1, $2, 'local', 'active')
     RETURNING id`,
    [email, "integration-test-placeholder-hash"]
  );
  const userId = insertedUser.rows[0]?.id as string;
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach')", [userId]);
  const insertedCoach = await pool.query(
    `INSERT INTO coach_profiles (user_id, full_name, discipline, active)
     VALUES ($1, $2, 'Test', true)
     RETURNING id`,
    [userId, name]
  );
  const coachId = insertedCoach.rows[0]?.id as string;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, new Date(Date.now() + 60 * 60 * 1000).toISOString()]
  );
  return { userId, coachId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
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

  const scopedCoach = await createCoachActor(pool, `Scoped Coach ${suffix}`);
  const scopedTemplate = await pool.query(
    `INSERT INTO class_templates
       (service_id, coach_id, weekday, local_start_time, duration_minutes, capacity, active)
     VALUES ($1, $2, $3, '19:00', 60, 5, true)
     RETURNING id`,
    [serviceId, scopedCoach.coachId, new Date().getUTCDay()]
  );
  const scopedSessionId = await createSession(pool, String(scopedTemplate.rows[0]?.id), 240);

  const agendaFrom = new Date(Date.now() - 60 * 60_000).toISOString();
  const agendaTo = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  const agenda = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions?from=${encodeURIComponent(agendaFrom)}&to=${encodeURIComponent(agendaTo)}&limit=25&offset=0`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(agenda.statusCode, 200);

  const unauthenticatedAgenda = await app.inject({
    method: "GET",
    url: "/api/v1/class-sessions"
  });
  assert.equal(unauthenticatedAgenda.statusCode, 401);

  const invalidAgendaPagination = await app.inject({
    method: "GET",
    url: "/api/v1/class-sessions?limit=101",
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(invalidAgendaPagination.statusCode, 400);
  assert.ok(agenda.json().items.some((item: { id: string }) => item.id === futureSessionId));
  const listedFuture = agenda.json().items.find((item: { id: string }) => item.id === futureSessionId);
  assert.equal(listedFuture.capacity, 1);
  assert.equal(listedFuture.confirmed_count, 0);
  assert.equal(listedFuture.my_booking_status, null);
  assert.ok(Number.isFinite(Date.parse(listedFuture.server_now)));
  assert.equal(agenda.json().limit, 25);
  assert.ok(agenda.json().total >= 2);

  const coachAgenda = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions?from=${encodeURIComponent(agendaFrom)}&to=${encodeURIComponent(agendaTo)}`,
    headers: { cookie: `ikigai_session=${scopedCoach.token}` }
  });
  assert.equal(coachAgenda.statusCode, 200);
  assert.ok(coachAgenda.json().items.some((item: { id: string }) => item.id === scopedSessionId));
  assert.ok(coachAgenda.json().items.every((item: { coach_id: string }) => item.coach_id === scopedCoach.coachId));

  const invertedAgenda = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions?from=${encodeURIComponent(agendaTo)}&to=${encodeURIComponent(agendaFrom)}`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(invertedAgenda.statusCode, 400);
  assert.equal(invertedAgenda.json().error, "invalid_date_range");

  const oversizedAgenda = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions?from=${encodeURIComponent(agendaFrom)}&to=${encodeURIComponent(new Date(Date.now() + 91 * 24 * 60 * 60_000).toISOString())}`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(oversizedAgenda.statusCode, 400);
  assert.equal(oversizedAgenda.json().error, "date_range_too_large");

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

  const admin = await createActor(pool, `Integration Admin ${suffix}`, "admin");
  const createdProfile = await app.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { full_name: `Created Member ${suffix}`, email: `created-${suffix}@example.test`, phone: "1111222233" }
  });
  assert.equal(createdProfile.statusCode, 201);
  assert.equal(createdProfile.json().member.status, "trial");
  const createdProfileAudit = await pool.query(
    "SELECT count(*)::int AS total FROM audit_events WHERE action = 'member.created' AND entity_id = $1",
    [createdProfile.json().member.id]
  );
  assert.equal(createdProfileAudit.rows[0]?.total, 1);

  const memberCreateDenied = await app.inject({
    method: "POST",
    url: "/api/v1/members",
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken
    },
    payload: { full_name: "Should Not Be Created" }
  });
  assert.equal(memberCreateDenied.statusCode, 403);

  const invalidDates = await app.inject({
    method: "PATCH",
    url: `/api/v1/members/${first.memberId}`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { joined_on: "2026-12-31", exited_on: "2026-01-01" }
  });
  assert.equal(invalidDates.statusCode, 400);
  assert.equal(invalidDates.json().error, "invalid_date_range");

  const attendanceStartsAt = new Date(Date.now() - 30 * 60_000);
  const attendanceEndsAt = new Date(attendanceStartsAt.getTime() + 60 * 60_000);
  const attendanceSessionResult = await pool.query(
    `INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot, status)
     VALUES ($1, $2, $3, 2, 'scheduled') RETURNING id`,
    [templateId, attendanceStartsAt.toISOString(), attendanceEndsAt.toISOString()]
  );
  const attendanceSessionId = attendanceSessionResult.rows[0]?.id as string;
  const firstAttendanceBookingResult = await pool.query(
    "INSERT INTO bookings (session_id, member_id, status, created_by) VALUES ($1, $2, 'confirmed', $3) RETURNING id",
    [attendanceSessionId, first.memberId, first.userId]
  );
  const secondAttendanceBookingResult = await pool.query(
    "INSERT INTO bookings (session_id, member_id, status, created_by) VALUES ($1, $2, 'confirmed', $3) RETURNING id",
    [attendanceSessionId, second.memberId, second.userId]
  );
  const firstAttendanceBookingId = firstAttendanceBookingResult.rows[0]?.id as string;
  const secondAttendanceBookingId = secondAttendanceBookingResult.rows[0]?.id as string;

  const attendanceSave = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${attendanceSessionId}/attendance`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: {
      records: [
        { bookingId: firstAttendanceBookingId, attended: true },
        { bookingId: secondAttendanceBookingId, attended: false }
      ]
    }
  });
  assert.equal(attendanceSave.statusCode, 200);
  assert.equal(attendanceSave.json().created, 2);

  const attendanceCorrection = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${attendanceSessionId}/attendance`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: {
      records: [
        { bookingId: firstAttendanceBookingId, attended: false },
        { bookingId: secondAttendanceBookingId, attended: false }
      ]
    }
  });
  assert.equal(attendanceCorrection.statusCode, 200);
  assert.equal(attendanceCorrection.json().updated, 1);
  assert.equal(attendanceCorrection.json().unchanged, 1);

  const sessionAttendance = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions/${attendanceSessionId}/attendance`,
    headers: { cookie: `ikigai_session=${admin.token}` }
  });
  assert.equal(sessionAttendance.statusCode, 200);
  assert.equal(sessionAttendance.json().records.length, 2);
  assert.equal(sessionAttendance.json().records.every((record: { attended: boolean }) => record.attended === false), true);

  const ownAttendance = await app.inject({
    method: "GET",
    url: `/api/v1/members/${first.memberId}/attendance`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(ownAttendance.statusCode, 200);
  assert.equal(ownAttendance.json().records.length, 1);
  assert.equal(ownAttendance.json().records[0].attended, false);

  const memberCannotRecordAttendance = await app.inject({
    method: "PUT",
    url: `/api/v1/class-sessions/${attendanceSessionId}/attendance`,
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken
    },
    payload: { records: [{ bookingId: firstAttendanceBookingId, attended: true }] }
  });
  assert.equal(memberCannotRecordAttendance.statusCode, 404);

  const attendanceAudit = await pool.query(
    `SELECT action FROM audit_events WHERE entity_id = ANY($1::text[])`,
    [[
      attendanceSave.json().records[0].id,
      attendanceSave.json().records[1].id
    ]]
  );
  assert.deepEqual(
    attendanceAudit.rows.map((row) => row.action).sort(),
    ["attendance.corrected", "attendance.recorded", "attendance.recorded"].sort()
  );

  const exerciseCreate = await app.inject({
    method: "POST",
    url: "/api/v1/exercises",
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { name: `Integration Exercise ${suffix}`, description: "Technique test", equipment: "Mat", precautions: "Keep form controlled" }
  });
  assert.equal(exerciseCreate.statusCode, 201);
  const exerciseId = exerciseCreate.json().exercise.id as string;

  const routineCreate = await app.inject({
    method: "POST",
    url: "/api/v1/routines",
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: {
      name: `Integration Routine ${suffix}`,
      discipline: "Strength",
      level: "Beginner",
      notes: "Version one",
      exercises: [{ exerciseId, sets: "3", reps: "12", restSeconds: 60 }]
    }
  });
  assert.equal(routineCreate.statusCode, 201);
  const routineId = routineCreate.json().routine.id as string;
  const versionOneId = routineCreate.json().version.id as string;
  assert.equal(routineCreate.json().version.version_number, 1);

  const routineVersionTwo = await app.inject({
    method: "POST",
    url: `/api/v1/routines/${routineId}/versions`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: {
      notes: "Version two",
      exercises: [{ exerciseId, sets: "4", reps: "10", restSeconds: 45 }]
    }
  });
  assert.equal(routineVersionTwo.statusCode, 201);
  assert.equal(routineVersionTwo.json().version.version_number, 2);

  const assignmentStart = new Date().toISOString().slice(0, 10);
  const assignmentPayload = {
    routineVersionId: versionOneId,
    startsOn: assignmentStart,
    notes: "Initial plan"
  };
  const routineAssignment = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/routine-assignments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: assignmentPayload
  });
  assert.equal(routineAssignment.statusCode, 201);

  const assignmentReplay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/routine-assignments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: assignmentPayload
  });
  assert.equal(assignmentReplay.statusCode, 200);
  assert.equal(assignmentReplay.json().replayed, true);

  const assignmentConflict = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/routine-assignments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { ...assignmentPayload, notes: "Different terms" }
  });
  assert.equal(assignmentConflict.statusCode, 409);

  const ownRoutines = await app.inject({
    method: "GET",
    url: `/api/v1/members/${first.memberId}/routine-assignments`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(ownRoutines.statusCode, 200);
  assert.equal(ownRoutines.json().assignments.length, 1);
  assert.equal(ownRoutines.json().assignments[0].version_number, 1);
  assert.equal(ownRoutines.json().assignments[0].exercises[0].reps, "12");

  const otherMemberRoutines = await app.inject({
    method: "GET",
    url: `/api/v1/members/${first.memberId}/routine-assignments`,
    headers: { cookie: `ikigai_session=${second.token}` }
  });
  assert.equal(otherMemberRoutines.statusCode, 404);

  const memberRoutineCatalogue = await app.inject({
    method: "GET",
    url: "/api/v1/routines",
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(memberRoutineCatalogue.statusCode, 403);

  const memberCannotCreateRoutine = await app.inject({
    method: "POST",
    url: "/api/v1/routines",
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken
    },
    payload: {
      name: "Forbidden routine",
      discipline: "Strength",
      level: "Beginner",
      exercises: [{ exerciseId, sets: "3", reps: "10" }]
    }
  });
  assert.equal(memberCannotCreateRoutine.statusCode, 403);

  const routineAudit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_id = ANY($1::text[])",
    [[exerciseId, routineId, routineAssignment.json().assignment.id]]
  );
  assert.deepEqual(
    routineAudit.rows.map((row) => row.action).sort(),
    ["exercise.created", "routine.created", "routine.version_created", "routine.assigned"].sort()
  );

  const unconfiguredObligation = await app.inject({
    method: "GET",
    url: `/api/v1/coaches/${coachId}/obligations?period=2026-10`,
    headers: { cookie: `ikigai_session=${admin.token}` }
  });
  assert.equal(unconfiguredObligation.statusCode, 200);
  assert.equal(unconfiguredObligation.json().configured, false);
  assert.equal(unconfiguredObligation.json().balance, null);

  const createdCoach = await app.inject({
    method: "POST",
    url: "/api/v1/coaches",
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { full_name: `Created Coach ${suffix}`, discipline: "Kick Boxing" }
  });
  assert.equal(createdCoach.statusCode, 201);

  const obligationPayload = { period: "2026-10", agreed_amount: "50000", due_on: "2026-10-15" };
  const obligationCreate = await app.inject({
    method: "POST",
    url: `/api/v1/coaches/${coachId}/obligations`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: obligationPayload
  });
  assert.equal(obligationCreate.statusCode, 201);
  assert.equal(obligationCreate.json().summary.balance, "50000.00");
  const obligationId = obligationCreate.json().obligation.id as string;

  const obligationReplay = await app.inject({
    method: "POST",
    url: `/api/v1/coaches/${coachId}/obligations`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: obligationPayload
  });
  assert.equal(obligationReplay.statusCode, 200);
  assert.equal(obligationReplay.json().replayed, true);

  const obligationConflict = await app.inject({
    method: "POST",
    url: `/api/v1/coaches/${coachId}/obligations`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken
    },
    payload: { ...obligationPayload, agreed_amount: "51000" }
  });
  assert.equal(obligationConflict.statusCode, 409);

  const paymentKey = `coach-payment-${suffix}`;
  const paymentPayload = { amount: "20000", paid_on: "2026-10-09", payment_method: "Transferencia" };
  const coachPayment = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/payments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": paymentKey
    },
    payload: paymentPayload
  });
  assert.equal(coachPayment.statusCode, 201);
  assert.equal(coachPayment.json().summary.balance, "30000.00");
  assert.equal(coachPayment.json().receiptType, "internal");

  const paymentReplay = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/payments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": paymentKey
    },
    payload: paymentPayload
  });
  assert.equal(paymentReplay.statusCode, 200);
  assert.equal(paymentReplay.json().summary.balance, "30000.00");

  const adjustmentKey = `coach-adjustment-${suffix}`;
  const coachAdjustment = await app.inject({
    method: "POST",
    url: `/api/v1/coach-obligations/${obligationId}/adjustments`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": adjustmentKey
    },
    payload: { amount_delta: "-5000", reason: "Corrección acordada" }
  });
  assert.equal(coachAdjustment.statusCode, 201);
  assert.equal(coachAdjustment.json().summary.balance, "25000.00");

  const obligationDetail = await app.inject({
    method: "GET",
    url: `/api/v1/coaches/${coachId}/obligations?period=2026-10`,
    headers: { cookie: `ikigai_session=${admin.token}` }
  });
  assert.equal(obligationDetail.statusCode, 200);
  assert.equal(obligationDetail.json().paid, "20000.00");
  assert.equal(obligationDetail.json().adjustmentTotal, "-5000.00");
  assert.equal(obligationDetail.json().balance, "25000.00");
  assert.equal(obligationDetail.json().payments.length, 1);
  assert.equal(obligationDetail.json().adjustments.length, 1);

  const coachAudit = await pool.query(
    `SELECT action FROM audit_events
      WHERE entity_id = ANY($1::text[])`,
    [[obligationId, coachPayment.json().payment.id, coachAdjustment.json().adjustment.id]]
  );
  assert.deepEqual(
    coachAudit.rows.map((row) => row.action).sort(),
    ["coach.obligation_created", "coach.payment_recorded", "coach.obligation_adjusted"].sort()
  );

  const chargeKey = `ledger-charge-${suffix}`;
  const chargePayload = {
    type: "charge",
    amount: "45000",
    description: "Cuota mensual de prueba",
    occurred_on: "2026-10-09",
    applied_period: "2026-10-01"
  };
  const charge = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": chargeKey
    },
    payload: chargePayload
  });
  assert.equal(charge.statusCode, 201);
  assert.equal(charge.json().balance, "45000.00");

  const chargeReplay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": chargeKey
    },
    payload: chargePayload
  });
  assert.equal(chargeReplay.statusCode, 200);
  assert.equal(chargeReplay.json().entry.id, charge.json().entry.id);
  assert.equal(chargeReplay.json().balance, "45000.00");

  const chargeKeyConflict = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": chargeKey
    },
    payload: { ...chargePayload, amount: "46000" }
  });
  assert.equal(chargeKeyConflict.statusCode, 409);

  const payment = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": `ledger-payment-${suffix}`
    },
    payload: {
      type: "payment",
      amount: "10000",
      description: "Pago parcial de prueba",
      occurred_on: "2026-10-09",
      applied_period: "2026-10-01",
      payment_method: "Transferencia"
    }
  });
  assert.equal(payment.statusCode, 201);
  assert.equal(payment.json().balance, "35000.00");
  assert.equal(payment.json().receiptType, "internal");

  const adjustmentKey = `ledger-adjustment-${suffix}`;
  const adjustmentPayload = {
    type: "adjustment",
    direction: "debit",
    amount: "2500",
    description: "Ajuste de prueba",
    occurred_on: "2026-10-09",
    applied_period: "2026-10-01"
  };
  const adjustment = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": adjustmentKey
    },
    payload: adjustmentPayload
  });
  assert.equal(adjustment.statusCode, 201);
  assert.equal(adjustment.json().entry.direction, "debit");
  assert.equal(adjustment.json().balance, "37500.00");

  const adjustmentReplay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": adjustmentKey
    },
    payload: adjustmentPayload
  });
  assert.equal(adjustmentReplay.statusCode, 200);
  assert.equal(adjustmentReplay.json().entry.id, adjustment.json().entry.id);
  assert.equal(adjustmentReplay.json().balance, "37500.00");

  const adjustmentMissingDirection = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${admin.token}`,
      "x-csrf-token": admin.csrfToken,
      "idempotency-key": `ledger-adjustment-missing-${suffix}`
    },
    payload: { ...adjustmentPayload, direction: undefined }
  });
  assert.equal(adjustmentMissingDirection.statusCode, 400);
  assert.equal(adjustmentMissingDirection.json().error, "adjustment_direction_required");

  const ownLedger = await app.inject({
    method: "GET",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(ownLedger.statusCode, 200);
  assert.equal(ownLedger.json().entries.length, 3);
  assert.equal(ownLedger.json().balance, "37500.00");

  const memberCannotPostLedger = await app.inject({
    method: "POST",
    url: `/api/v1/members/${first.memberId}/ledger-entries`,
    headers: {
      origin,
      cookie: `ikigai_session=${first.token}`,
      "x-csrf-token": first.csrfToken,
      "idempotency-key": `member-payment-${suffix}`
    },
    payload: {
      type: "payment",
      amount: "100",
      description: "Not allowed",
      occurred_on: "2026-10-09"
    }
  });
  assert.equal(memberCannotPostLedger.statusCode, 403);

  const ledgerAudit = await pool.query(
    `SELECT count(*)::int AS total FROM audit_events
      WHERE action = 'ledger.entry_created' AND entity_id = ANY($1::text[])`,
    [[charge.json().entry.id, payment.json().entry.id, adjustment.json().entry.id]]
  );
  assert.equal(ledgerAudit.rows[0]?.total, 3);

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

  const agendaAfterBooking = await app.inject({
    method: "GET",
    url: `/api/v1/class-sessions?from=${encodeURIComponent(agendaFrom)}&to=${encodeURIComponent(agendaTo)}`,
    headers: { cookie: `ikigai_session=${first.token}` }
  });
  assert.equal(agendaAfterBooking.statusCode, 200);
  const listedAfterBooking = agendaAfterBooking.json().items.find((item: { id: string }) => item.id === futureSessionId);
  assert.equal(listedAfterBooking.my_booking_status, firstBooking.status === "confirmed" || firstBooking.status === "waitlist" ? firstBooking.status : null);
  assert.equal(listedAfterBooking.confirmed_count, 1);

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
