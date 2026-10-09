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
const origin = "https://routines-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "admin" | "member") {
  const email = `routines-it-${randomUUID()}@example.test`;
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

function headers(actor: { token: string; csrfToken: string }) {
  return {
    origin,
    cookie: `ikigai_session=${actor.token}`,
    "x-csrf-token": actor.csrfToken
  };
}

test("PostgreSQL routines preserve versions, assignment history, and member boundaries", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-routines-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Routine Admin ${suffix}`, "admin");
  const member = await createActor(pool, `Routine Member ${suffix}`, "member");
  const other = await createActor(pool, `Other Routine Member ${suffix}`, "member");

  const exercise = await app.inject({
    method: "POST",
    url: "/api/v1/exercises",
    headers: headers(admin),
    payload: {
      name: `Squat ${suffix}`,
      description: "Controlled squat pattern",
      equipment: "Bodyweight",
      precautions: "Use a pain-free range"
    }
  });
  assert.equal(exercise.statusCode, 201);
  const exerciseId = String(exercise.json().exercise.id);

  const memberExerciseWrite = await app.inject({
    method: "POST",
    url: "/api/v1/exercises",
    headers: headers(member),
    payload: { name: `Forbidden Exercise ${suffix}` }
  });
  assert.equal(memberExerciseWrite.statusCode, 403);

  const createdRoutine = await app.inject({
    method: "POST",
    url: "/api/v1/routines",
    headers: headers(admin),
    payload: {
      name: `Strength Base ${suffix}`,
      discipline: "Functional",
      level: "Beginner",
      notes: "Version one",
      exercises: [{ exerciseId, sets: "3", reps: "12", restSeconds: 60 }]
    }
  });
  assert.equal(createdRoutine.statusCode, 201);
  const routineId = String(createdRoutine.json().routine.id);
  const versionOneId = String(createdRoutine.json().version.id);
  assert.equal(createdRoutine.json().version.version_number, 1);

  const memberRoutineList = await app.inject({
    method: "GET",
    url: "/api/v1/routines",
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(memberRoutineList.statusCode, 403);

  const startsOn = new Date().toISOString().slice(0, 10);
  const assignmentPayload = {
    routineVersionId: versionOneId,
    startsOn,
    notes: "Initial assignment"
  };
  const assignment = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/routine-assignments`,
    headers: headers(admin),
    payload: assignmentPayload
  });
  assert.equal(assignment.statusCode, 201);
  assert.equal(assignment.json().replayed, false);

  const replay = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/routine-assignments`,
    headers: headers(admin),
    payload: assignmentPayload
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().replayed, true);

  const conflict = await app.inject({
    method: "POST",
    url: `/api/v1/members/${member.memberId}/routine-assignments`,
    headers: headers(admin),
    payload: { ...assignmentPayload, notes: "Different terms" }
  });
  assert.equal(conflict.statusCode, 409);

  const newVersion = await app.inject({
    method: "POST",
    url: `/api/v1/routines/${routineId}/versions`,
    headers: headers(admin),
    payload: {
      notes: "Version two, updated prescription",
      exercises: [{ exerciseId, sets: "4", reps: "10", restSeconds: 45 }]
    }
  });
  assert.equal(newVersion.statusCode, 201);
  assert.equal(newVersion.json().version.version_number, 2);

  const memberAssignments = await app.inject({
    method: "GET",
    url: `/api/v1/members/${member.memberId}/routine-assignments`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(memberAssignments.statusCode, 200);
  assert.equal(memberAssignments.json().assignments.length, 1);
  assert.equal(memberAssignments.json().assignments[0].routine_version_id, versionOneId);
  assert.equal(memberAssignments.json().assignments[0].exercises[0].sets, "3");

  const crossMemberAssignments = await app.inject({
    method: "GET",
    url: `/api/v1/members/${other.memberId}/routine-assignments`,
    headers: { cookie: `ikigai_session=${member.token}` }
  });
  assert.equal(crossMemberAssignments.statusCode, 404);

  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_type='routine_assignment' AND entity_id=$1",
    [assignment.json().assignment.id]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ["routine.assigned"]);
});
