import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { coachHasMemberScope, resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface RoutineExerciseInput {
  exerciseId: string;
  sets: string;
  reps?: string;
  durationSeconds?: number;
  restSeconds?: number;
  notes?: string;
}
interface ExerciseBody {
  name: string;
  description?: string;
  equipment?: string;
  precautions?: string;
}
interface RoutineBody {
  name: string;
  discipline: string;
  level: string;
  notes?: string;
  exercises: RoutineExerciseInput[];
}
interface VersionBody {
  notes?: string;
  exercises: RoutineExerciseInput[];
}
interface AssignmentBody {
  routineVersionId: string;
  startsOn: string;
  endsOn?: string;
  notes?: string;
}
interface RuleRow extends Record<string, unknown> { id: string }
interface AssignmentRow extends Record<string, unknown> {
  id: string;
  member_id: string;
  routine_version_id: string;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
}
class RoutineError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "RoutineError";
  }
}
function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof RoutineError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code) : "";
  if (code === "23505") return reply.code(409).send({
    error: "routine_conflict", message: "The routine or assignment conflicts with an existing record."
  });
  if (code === "23514" || code === "23502") return reply.code(400).send({
    error: "invalid_routine", message: "One or more routine fields violate a data constraint."
  });
  throw error;
}
function validateExercises(exercises: RoutineExerciseInput[]) {
  if (exercises.some((item) => !item.sets.trim() || (!item.reps?.trim() && item.durationSeconds === undefined))) {
    throw new RoutineError(400, "invalid_routine_exercise", "Each exercise needs sets and either repetitions or duration.");
  }
}
async function insertExercises(tx: Database, versionId: string, items: RoutineExerciseInput[]) {
  validateExercises(items);
  const ids = Array.from(new Set(items.map((item) => item.exerciseId)));
  const active = await tx.query("SELECT id FROM exercises WHERE id = ANY($1::uuid[]) AND active = true", [ids]);
  if (active.rows.length !== ids.length) {
    throw new RoutineError(400, "exercise_not_available", "Every referenced exercise must exist and be active.");
  }
  for (const [index, item] of items.entries()) {
    await tx.query(
      "INSERT INTO routine_exercises (routine_version_id, exercise_id, position, sets, reps, duration_seconds, rest_seconds, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [versionId, item.exerciseId, index + 1, item.sets.trim(), item.reps?.trim() || null, item.durationSeconds ?? null, item.restSeconds ?? null, item.notes?.trim() || null]
    );
  }
}
const exerciseItemSchema = {
  type: "object",
  required: ["exerciseId", "sets"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "string", format: "uuid" },
    sets: { type: "string", minLength: 1, maxLength: 80 },
    reps: { type: "string", maxLength: 80 },
    durationSeconds: { type: "integer", minimum: 1, maximum: 86400 },
    restSeconds: { type: "integer", minimum: 0, maximum: 3600 },
    notes: { type: "string", maxLength: 500 }
  }
} as const;

export function registerRoutineRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get("/api/v1/exercises", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin") && !actor.roles.includes("coach")) return reply.code(403).send({ error: "forbidden", message: "Only administration and coaches can browse exercises." });
    const result = await db.query("SELECT id, name, description, equipment, precautions FROM exercises WHERE active = true ORDER BY lower(name), id");
    return reply.send({ exercises: result.rows });
  });

  app.post<{ Body: ExerciseBody }>("/api/v1/exercises", {
    schema: { body: {
      type: "object", required: ["name"], additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 2000 },
        equipment: { type: "string", maxLength: 240 },
        precautions: { type: "string", maxLength: 1000 }
      }
    } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Only administration can create exercises." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_exercise", message: "Exercise name cannot be empty." });
    try {
      const exercise = await transactionalDb.transaction(async (tx) => {
        const result = await tx.query(
          "INSERT INTO exercises (name, description, equipment, precautions, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, description, equipment, precautions, active",
          [name, request.body.description?.trim() || null, request.body.equipment?.trim() || null, request.body.precautions?.trim() || null, actor.userId]
        );
        const row = result.rows[0];
        if (!row) throw new Error("Exercise insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data) VALUES ($1,'exercise.created','exercise',$2,$3,$4::jsonb)",
          [actor.userId, row.id, request.id, JSON.stringify({ name })]
        );
        return row;
      });
      return reply.code(201).send({ exercise });
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/routines", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin") && !actor.roles.includes("coach")) return reply.code(403).send({ error: "forbidden", message: "Members can only view routines assigned to them." });
    const result = await db.query(
      "SELECT r.id, r.name, r.discipline, r.level, r.active, rv.id AS version_id, rv.version_number, rv.notes AS version_notes, COALESCE(json_agg(json_build_object('position',re.position,'exerciseId',e.id,'name',e.name,'description',e.description,'equipment',e.equipment,'precautions',e.precautions,'sets',re.sets,'reps',re.reps,'durationSeconds',re.duration_seconds,'restSeconds',re.rest_seconds,'notes',re.notes) ORDER BY re.position) FILTER (WHERE re.exercise_id IS NOT NULL),'[]'::json) AS exercises FROM routines r JOIN LATERAL (SELECT id,routine_id,version_number,notes FROM routine_versions WHERE routine_id=r.id ORDER BY version_number DESC LIMIT 1) rv ON true LEFT JOIN routine_exercises re ON re.routine_version_id=rv.id LEFT JOIN exercises e ON e.id=re.exercise_id WHERE r.active=true GROUP BY r.id,rv.id,rv.version_number,rv.notes ORDER BY lower(r.name),r.id"
    );
    return reply.send({ routines: result.rows });
  });

  app.post<{ Body: RoutineBody }>("/api/v1/routines", {
    schema: { body: {
      type: "object", required: ["name", "discipline", "level", "exercises"], additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        discipline: { type: "string", minLength: 1, maxLength: 120 },
        level: { type: "string", minLength: 1, maxLength: 80 },
        notes: { type: "string", maxLength: 2000 },
        exercises: { type: "array", minItems: 1, maxItems: 50, items: exerciseItemSchema }
      }
    } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Only administration can create routines." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const name = request.body.name.trim();
    const discipline = request.body.discipline.trim();
    const level = request.body.level.trim();
    if (!name || !discipline || !level) return reply.code(400).send({ error: "invalid_routine", message: "Routine name, discipline and level cannot be empty." });
    try {
      const routine = await transactionalDb.transaction(async (tx) => {
        const created = await tx.query(
          "INSERT INTO routines (name, discipline, level, created_by) VALUES ($1,$2,$3,$4) RETURNING id,name,discipline,level,active",
          [name, discipline, level, actor.userId]
        );
        const row = created.rows[0] as RuleRow | undefined;
        if (!row) throw new Error("Routine insert did not return a row.");
        const versionResult = await tx.query(
          "INSERT INTO routine_versions (routine_id, version_number, notes, created_by) VALUES ($1,1,$2,$3) RETURNING id,routine_id,version_number,notes",
          [row.id, request.body.notes?.trim() || null, actor.userId]
        );
        const version = versionResult.rows[0];
        if (!version) throw new Error("Routine version insert did not return a row.");
        await insertExercises(tx, String(version.id), request.body.exercises);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data) VALUES ($1,'routine.created','routine',$2,$3,$4::jsonb)",
          [actor.userId, row.id, request.id, JSON.stringify({ name, discipline, level, versionNumber: 1 })]
        );
        return { routine: row, version };
      });
      return reply.code(201).send(routine);
    } catch (error) { return sendError(reply, error); }
  });

  app.post<{ Params: { id: string }; Body: VersionBody }>("/api/v1/routines/:id/versions", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", required: ["exercises"], additionalProperties: false, properties: {
        notes: { type: "string", maxLength: 2000 },
        exercises: { type: "array", minItems: 1, maxItems: 50, items: exerciseItemSchema }
      } }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Only administration can create routine versions." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const version = await transactionalDb.transaction(async (tx) => {
        const routine = await tx.query("SELECT id,active FROM routines WHERE id=$1 FOR UPDATE", [request.params.id]);
        if (!routine.rows[0] || routine.rows[0].active !== true) throw new RoutineError(404, "not_found", "The active routine was not found.");
        const latest = await tx.query("SELECT COALESCE(MAX(version_number),0)::int AS version_number FROM routine_versions WHERE routine_id=$1", [request.params.id]);
        const next = Number(latest.rows[0]?.version_number ?? 0) + 1;
        const created = await tx.query(
          "INSERT INTO routine_versions (routine_id,version_number,notes,created_by) VALUES ($1,$2,$3,$4) RETURNING id,routine_id,version_number,notes",
          [request.params.id, next, request.body.notes?.trim() || null, actor.userId]
        );
        const row = created.rows[0];
        if (!row) throw new Error("Routine version insert did not return a row.");
        await insertExercises(tx, String(row.id), request.body.exercises);
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'routine.version_created','routine',$2,$3,$4::jsonb)",
          [actor.userId, request.params.id, request.id, JSON.stringify({ versionNumber: next })]
        );
        return row;
      });
      return reply.code(201).send({ version });
    } catch (error) { return sendError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/api/v1/members/:id/routine-assignments", {
    schema: { params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    const memberId = request.params.id;
    const isOwner = actor.roles.includes("member") && actor.memberId === memberId;
    let coachScopeAllowed = false;
    if (!actor.roles.includes("admin") && !isOwner && actor.roles.includes("coach") && actor.coachId) {
      coachScopeAllowed = await coachHasMemberScope(db, actor.coachId, memberId);
    }
    if (!actor.roles.includes("admin") && !isOwner && !coachScopeAllowed) return reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });
    const result = await db.query(
      "SELECT ra.id AS assignment_id,ra.starts_on,ra.ends_on,ra.notes AS assignment_notes,r.id AS routine_id,r.name,r.discipline,r.level,rv.id AS routine_version_id,rv.version_number,rv.notes AS version_notes,COALESCE(json_agg(json_build_object('position',re.position,'exerciseId',e.id,'name',e.name,'description',e.description,'equipment',e.equipment,'precautions',e.precautions,'sets',re.sets,'reps',re.reps,'durationSeconds',re.duration_seconds,'restSeconds',re.rest_seconds,'notes',re.notes) ORDER BY re.position) FILTER (WHERE re.exercise_id IS NOT NULL),'[]'::json) AS exercises FROM routine_assignments ra JOIN routine_versions rv ON rv.id=ra.routine_version_id JOIN routines r ON r.id=rv.routine_id LEFT JOIN routine_exercises re ON re.routine_version_id=rv.id LEFT JOIN exercises e ON e.id=re.exercise_id WHERE ra.member_id=$1 GROUP BY ra.id,r.id,rv.id ORDER BY ra.starts_on DESC,ra.created_at DESC",
      [memberId]
    );
    return reply.send({ memberId, assignments: result.rows });
  });

  app.post<{ Params: { id: string }; Body: AssignmentBody }>("/api/v1/members/:id/routine-assignments", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", required: ["routineVersionId","startsOn"], additionalProperties: false, properties: {
        routineVersionId: { type: "string", format: "uuid" },
        startsOn: { type: "string", format: "date" },
        endsOn: { type: "string", format: "date" },
        notes: { type: "string", maxLength: 1000 }
      } }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin") && !actor.roles.includes("coach")) return reply.code(403).send({ error: "forbidden", message: "Only administration or an assigned coach can assign routines." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    if (request.body.endsOn && request.body.endsOn < request.body.startsOn) return reply.code(400).send({ error: "invalid_assignment_dates", message: "The end date cannot be before the start date." });
    if (actor.roles.includes("coach") && !actor.roles.includes("admin")) {
      if (!actor.coachId || !(await coachHasMemberScope(db, actor.coachId, request.params.id))) return reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });
    }
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const member = await tx.query("SELECT id FROM member_profiles WHERE id=$1 FOR UPDATE", [request.params.id]);
        if (!member.rows[0]) throw new RoutineError(404, "not_found", "The member was not found.");
        const version = await tx.query("SELECT rv.id FROM routine_versions rv JOIN routines r ON r.id=rv.routine_id WHERE rv.id=$1 AND r.active=true FOR UPDATE OF rv", [request.body.routineVersionId]);
        if (!version.rows[0]) throw new RoutineError(404, "routine_version_not_found", "The routine version was not found or is inactive.");
        const existing = await tx.query<AssignmentRow>(
          "SELECT id,member_id,routine_version_id,starts_on::text AS starts_on,ends_on::text AS ends_on,notes FROM routine_assignments WHERE member_id=$1 AND routine_version_id=$2 AND starts_on=$3::date LIMIT 1 FOR UPDATE",
          [request.params.id, request.body.routineVersionId, request.body.startsOn]
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          if ((row.ends_on ?? null) !== (request.body.endsOn ?? null) || (row.notes ?? null) !== (request.body.notes?.trim() || null)) {
            throw new RoutineError(409, "assignment_conflict", "An assignment already exists for this member and start date with different terms.");
          }
          return { assignment: row, replayed: true };
        }
        const inserted = await tx.query<AssignmentRow>(
          "INSERT INTO routine_assignments (member_id,routine_version_id,assigned_by,starts_on,ends_on,notes) VALUES ($1,$2,$3,$4::date,$5::date,$6) RETURNING id,member_id,routine_version_id,starts_on::text AS starts_on,ends_on::text AS ends_on,notes",
          [request.params.id, request.body.routineVersionId, actor.userId, request.body.startsOn, request.body.endsOn ?? null, request.body.notes?.trim() || null]
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Routine assignment insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'routine.assigned','routine_assignment',$2,$3,$4::jsonb)",
          [actor.userId, row.id, request.id, JSON.stringify({ memberId: row.member_id, routineVersionId: row.routine_version_id, startsOn: row.starts_on, endsOn: row.ends_on })]
        );
        return { assignment: row, replayed: false };
      });
      return reply.code(result.replayed ? 200 : 201).send(result);
    } catch (error) { return sendError(reply, error); }
  });

  // Los miembros con quienes el profesor tiene clases (las mismas reglas de alcance que asistencia y rutinas).
  app.get("/api/v1/coach/members", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("coach") || !actor.coachId) return reply.code(403).send({ error: "forbidden", message: "Only coaches can list their members." });
    const result = await db.query(
      `SELECT mp.id, mp.full_name, mp.status
         FROM member_profiles mp
        WHERE mp.anonymized_at IS NULL AND (
          EXISTS (SELECT 1 FROM recurring_assignments ra JOIN class_templates ct ON ct.id = ra.template_id
                   WHERE ra.member_id = mp.id AND ct.coach_id = $1 AND ra.active = true
                     AND ra.starts_on <= CURRENT_DATE AND (ra.ends_on IS NULL OR ra.ends_on >= CURRENT_DATE))
          OR EXISTS (SELECT 1 FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id
                      WHERE b.member_id = mp.id AND ct.coach_id = $1 AND b.status IN ('confirmed','waitlist')
                        AND cs.starts_at BETWEEN now() - interval '30 days' AND now() + interval '30 days'))
        ORDER BY lower(mp.full_name), mp.id`,
      [actor.coachId]
    );
    return reply.send({ members: result.rows });
  });
}
