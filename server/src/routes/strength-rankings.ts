import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface RankingQuery { exerciseId?: string }
interface RecordBody { memberId: string; exerciseId: string; weightKg: number; recordedAt?: string; notes?: string; alias?: string }
interface RecordParams { id: string }
interface UpdateBody { weightKg?: number; recordedAt?: string; notes?: string }

function bad(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: "invalid_strength_record", message });
}

// La marca se guarda en weight_kg, pero su unidad la define el ejercicio: kg o repeticiones.
const MAX_REPS = 1000;
function invalidMarkForUnit(unit: unknown, value: number): string | null {
  if (unit === "reps" && (!Number.isInteger(value) || value > MAX_REPS)) {
    return "Este ejercicio se mide en repeticiones: ingresá un número entero entre 1 y " + MAX_REPS + ".";
  }
  return null;
}

export function registerStrengthRankingRoutes(app: FastifyInstance, db: Database, transactionalDb: TransactionalDatabase, config: AppConfig): void {
  app.get<{ Querystring: RankingQuery }>("/api/v1/strength-rankings", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { exerciseId: { type: "string", format: "uuid" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });

    const exercises = await db.query("SELECT id, code, name, unit, display_order FROM strength_exercises WHERE active = true ORDER BY display_order, id");
    const selectedExerciseId = request.query.exerciseId ?? String(exercises.rows[0]?.id ?? "");
    if (!selectedExerciseId) return reply.send({ exercises: [], exercise: null, rankings: [], me: null });

    const exercise = exercises.rows.find((item) => String(item.id) === selectedExerciseId);
    if (!exercise) return reply.code(404).send({ error: "not_found", message: "The requested strength exercise was not found." });

    const rankings = await db.query(
      "WITH best AS (" +
      " SELECT sr.member_id, m.full_name AS member_name, COALESCE(m.ranking_alias, 'Miembro') AS display_name, MAX(sr.weight_kg) AS best_weight_kg," +
      "        MAX(sr.recorded_at) FILTER (WHERE sr.weight_kg = (" +
      "          SELECT MAX(sr2.weight_kg) FROM strength_records sr2 WHERE sr2.member_id = sr.member_id AND sr2.exercise_id = sr.exercise_id" +
      "        )) AS best_recorded_at" +
      "   FROM strength_records sr JOIN member_profiles m ON m.id = sr.member_id" +
      "  WHERE sr.exercise_id = $1 AND m.anonymized_at IS NULL AND m.status <> 'exited'" +
      "  GROUP BY sr.member_id, m.full_name, m.ranking_alias, sr.exercise_id" +
      ")" +
      " SELECT ROW_NUMBER() OVER (ORDER BY best_weight_kg DESC, lower(display_name), member_id) AS position," +
      "        member_id, member_name, display_name, best_weight_kg, best_recorded_at" +
      "   FROM best ORDER BY best_weight_kg DESC, lower(display_name), member_id",
      [selectedExerciseId]
    );

    const own = actor.memberId
      ? rankings.rows.find((item) => String(item.member_id) === String(actor.memberId)) ?? null
      : null;
    const visibleRankings = rankings.rows.map((item) => {
      const row = { ...item };
      if (!actor.roles.includes("admin")) {
        delete row.member_name;
        if (String(row.member_id) !== String(actor.memberId)) {
          delete row.member_id;
        }
      }
      return row;
    });

    const visibleMe = own ? { ...own } : null;
    if (visibleMe && !actor.roles.includes("admin")) {
      delete visibleMe.member_name;
    }

    return reply.send({ exercises: exercises.rows, exercise, rankings: visibleRankings, me: visibleMe });
  });

  app.get<{ Querystring: RankingQuery }>("/api/v1/admin/strength-aliases", {
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    const aliases = await db.query(
      "SELECT id AS member_id, ranking_alias FROM member_profiles WHERE anonymized_at IS NULL AND ranking_alias IS NOT NULL ORDER BY lower(ranking_alias), id"
    );
    return reply.send({ aliases: aliases.rows });
  });

  app.put<{ Params: { memberId: string }; Body: { alias: string } }>("/api/v1/admin/strength-aliases/:memberId", {
    schema: {
      params: { type: "object", required: ["memberId"], additionalProperties: false, properties: { memberId: { type: "string", format: "uuid" } } },
      body: { type: "object", required: ["alias"], additionalProperties: false, properties: { alias: { type: "string", minLength: 2, maxLength: 24 } } }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const trimmedAlias = request.body.alias.trim();
    if (trimmedAlias.length < 2 || trimmedAlias.length > 24) return bad(reply, "Alias length invalid.");

    try {
      await transactionalDb.transaction(async (tx) => {
        const member = await tx.query("SELECT id, ranking_alias FROM member_profiles WHERE id = $1 AND anonymized_at IS NULL FOR UPDATE", [request.params.memberId]);
        if (!member.rows[0]) throw Object.assign(new Error("Not found"), { statusCode: 404 });
        const beforeAlias = member.rows[0].ranking_alias;
        if (beforeAlias !== trimmedAlias) {
          await tx.query("UPDATE member_profiles SET ranking_alias = $1 WHERE id = $2", [trimmedAlias, request.params.memberId]);
          await tx.query(
            "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1,'member.ranking_alias_set','member',$2,$3,$4::jsonb,$5::jsonb)",
            [actor.userId, request.params.memberId, request.id, JSON.stringify({ rankingAlias: beforeAlias }), JSON.stringify({ rankingAlias: trimmedAlias })]
          );
        }
      });
      return reply.send({ ok: true });
    } catch (e: any) {
      if (e.statusCode === 404) return reply.code(404).send({ error: "not_found", message: "Member not found." });
      if (e.code === "23505") return reply.code(409).send({ error: "alias_taken", message: "Alias taken." });
      throw e;
    }
  });

  app.get<{ Querystring: RankingQuery }>("/api/v1/admin/strength-records", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { exerciseId: { type: "string", format: "uuid" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    const params: unknown[] = [];
    const where = request.query.exerciseId ? "WHERE sr.exercise_id = $1" : "";
    if (request.query.exerciseId) params.push(request.query.exerciseId);
    const records = await db.query(
      "SELECT sr.id, sr.member_id, m.full_name AS member_name, sr.exercise_id, se.code, se.name AS exercise_name, se.unit, sr.weight_kg, sr.recorded_at, sr.notes " +
      "FROM strength_records sr JOIN member_profiles m ON m.id=sr.member_id JOIN strength_exercises se ON se.id=sr.exercise_id " +
      where + " ORDER BY sr.recorded_at DESC, sr.id DESC",
      params
    );
    return reply.send({ records: records.rows });
  });

  app.post<{ Body: RecordBody }>("/api/v1/admin/strength-records", {
    schema: { body: { type: "object", required: ["memberId", "exerciseId", "weightKg"], additionalProperties: false, properties: {
      memberId: { type: "string", format: "uuid" },
      exerciseId: { type: "string", format: "uuid" },
      weightKg: { type: "number", exclusiveMinimum: 0, maximum: 2000 },
      recordedAt: { type: "string", format: "date-time" },
       notes: { type: "string", maxLength: 500 },
       alias: { type: "string", minLength: 2, maxLength: 24 }
     } } }


  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const weight = Number(request.body.weightKg);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 2000) return bad(reply, "El peso debe ser mayor que 0 y no superar 2000 kg.");

    try {
      const record = await transactionalDb.transaction(async (tx) => {
        const member = await tx.query("SELECT id FROM member_profiles WHERE id = $1 AND anonymized_at IS NULL", [request.body.memberId]);
        if (!member.rows[0]) throw Object.assign(new Error("Member not found."), { statusCode: 404 });
        const exercise = await tx.query("SELECT id, unit FROM strength_exercises WHERE id = $1 AND active = true", [request.body.exerciseId]);
        if (!exercise.rows[0]) throw Object.assign(new Error("Exercise not found."), { statusCode: 404 });
        const unitError = invalidMarkForUnit(exercise.rows[0].unit, weight);
        if (unitError) throw Object.assign(new Error(unitError), { statusCode: 400, errorCode: "invalid_strength_record" });

        const inserted = await tx.query(
          "INSERT INTO strength_records (member_id, exercise_id, weight_kg, recorded_at, recorded_by, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, member_id, exercise_id, weight_kg, recorded_at, recorded_by, notes",
          [request.body.memberId, request.body.exerciseId, weight, request.body.recordedAt ?? new Date().toISOString(), actor.userId, request.body.notes?.trim() || null]
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Strength record insert did not return a row.");

        if (request.body.alias !== undefined) {
          const trimmedAlias = request.body.alias.trim();
          if (trimmedAlias.length < 2 || trimmedAlias.length > 24) throw Object.assign(new Error("Invalid alias length."), { statusCode: 400, errorCode: "invalid_alias" });

          const before = await tx.query("SELECT ranking_alias FROM member_profiles WHERE id = $1 FOR UPDATE", [request.body.memberId]);
          const beforeAlias = before.rows[0]?.ranking_alias;
          if (beforeAlias !== trimmedAlias) {
            try {
              await tx.query("UPDATE member_profiles SET ranking_alias = $1 WHERE id = $2", [trimmedAlias, request.body.memberId]);
              await tx.query(
                "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1,'member.ranking_alias_set','member',$2,$3,$4::jsonb,$5::jsonb)",
                [actor.userId, request.body.memberId, request.id, JSON.stringify({ rankingAlias: beforeAlias }), JSON.stringify({ rankingAlias: trimmedAlias })]
              );
            } catch (e: any) {
              if (e.code === "23505") throw Object.assign(new Error("Alias taken."), { statusCode: 409 });
              throw e;
            }
          }
        } else {
          const check = await tx.query("SELECT ranking_alias FROM member_profiles WHERE id = $1", [request.body.memberId]);
          if (check.rows[0]?.ranking_alias === null) {
              throw Object.assign(new Error("Alias required."), { statusCode: 400 });
          }
        }

        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data) VALUES ($1,'strength_record.created','strength_record',$2,$3,$4::jsonb)",
          [actor.userId, row.id, request.id, JSON.stringify({ memberId: row.member_id, exerciseId: row.exercise_id, weightKg: row.weight_kg })]
        );
        return row;
      });
      return reply.code(201).send({ record });
    } catch (error) {
      if (typeof error === "object" && error !== null && "statusCode" in error) {
        const code = Number((error as { statusCode?: unknown }).statusCode);
        if (code === 404) return reply.code(404).send({ error: "not_found", message: "El miembro o ejercicio solicitado no existe." });
        if (code === 400) {
          if ((error as { errorCode?: string }).errorCode === "invalid_strength_record") return bad(reply, String((error as { message?: unknown }).message));
          const invalid = (error as { errorCode?: string }).errorCode === "invalid_alias";
          return reply.code(400).send(invalid ? { error: "invalid_alias", message: "El apodo debe tener entre 2 y 24 caracteres." } : { error: "alias_required", message: "El miembro necesita un apodo para el ranking." });
        }
        if (code === 409) return reply.code(409).send({ error: "alias_taken", message: "Alias taken." });
      }
      throw error;
    }
  });

  app.patch<{ Params: RecordParams; Body: UpdateBody }>("/api/v1/admin/strength-records/:id", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", minProperties: 1, additionalProperties: false, properties: {
        weightKg: { type: "number", exclusiveMinimum: 0, maximum: 2000 },
        recordedAt: { type: "string", format: "date-time" },
        notes: { type: "string", maxLength: 500 }
      } }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const fields: string[] = [];
    const values: unknown[] = [];
    if (request.body.weightKg !== undefined) {
      const weight = Number(request.body.weightKg);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 2000) return bad(reply, "El peso debe ser mayor que 0 y no superar 2000 kg.");
      fields.push("weight_kg"); values.push(weight);
    }
    if (request.body.recordedAt !== undefined) { fields.push("recorded_at"); values.push(request.body.recordedAt); }
    if (request.body.notes !== undefined) { fields.push("notes"); values.push(request.body.notes.trim() || null); }

    const record = await transactionalDb.transaction(async (tx) => {
      const current = await tx.query("SELECT id, member_id, exercise_id, weight_kg, recorded_at, notes FROM strength_records WHERE id=$1 FOR UPDATE", [request.params.id]);
      if (!current.rows[0]) return null;
      if (request.body.weightKg !== undefined) {
        const exercise = await tx.query("SELECT unit FROM strength_exercises WHERE id = $1", [current.rows[0].exercise_id]);
        const unitError = invalidMarkForUnit(exercise.rows[0]?.unit, Number(request.body.weightKg));
        if (unitError) return { unitError };
      }
      const assignments = fields.map((field, index) => field + " = $" + (index + 1)).join(", ");
      values.push(request.params.id);
      const updated = await tx.query("UPDATE strength_records SET " + assignments + " WHERE id=$" + values.length + " RETURNING id, member_id, exercise_id, weight_kg, recorded_at, recorded_by, notes", values);
      const row = updated.rows[0];
      if (!row) throw new Error("Strength record update did not return a row.");
      await tx.query(
        "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1,'strength_record.corrected','strength_record',$2,$3,$4::jsonb,$5::jsonb)",
        [actor.userId, row.id, request.id, JSON.stringify(current.rows[0]), JSON.stringify({ weightKg: row.weight_kg, recordedAt: row.recorded_at, notes: row.notes })]
      );
      return row;
    });

    if (!record) return reply.code(404).send({ error: "not_found", message: "El registro no existe." });
    if ("unitError" in record) return bad(reply, String(record.unitError));
    return reply.send({ record });
  });

  app.delete<{ Params: RecordParams }>("/api/v1/admin/strength-records/:id", {
    schema: { params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const deleted = await transactionalDb.transaction(async (tx) => {
      const current = await tx.query("SELECT id, member_id, exercise_id, weight_kg, recorded_at FROM strength_records WHERE id=$1 FOR UPDATE", [request.params.id]);
      if (!current.rows[0]) return null;
      await tx.query("DELETE FROM strength_records WHERE id=$1", [request.params.id]);
      await tx.query(
        "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data) VALUES ($1,'strength_record.deleted','strength_record',$2,$3,$4::jsonb)",
        [actor.userId, request.params.id, request.id, JSON.stringify(current.rows[0])]
      );
      return current.rows[0];
    });

    if (!deleted) return reply.code(404).send({ error: "not_found", message: "El registro no existe." });
    return reply.send({ deleted: true, record: deleted });
  });
}
