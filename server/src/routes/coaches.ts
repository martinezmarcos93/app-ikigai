import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface CoachParams { id: string }
interface ObligationParams { id: string }
interface ObligationQuery { period: string }
interface CreateCoachBody {
  full_name: string;
  discipline: string;
  email?: string;
  phone?: string;
}
interface CreateObligationBody {
  period: string;
  agreed_amount: string;
  due_on?: string;
}
interface PaymentBody {
  amount: string;
  paid_on: string;
  payment_method?: string;
  reference?: string;
}
interface AdjustmentBody {
  amount_delta: string;
  reason: string;
}
interface CoachRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  discipline: string;
  email: string | null;
  phone: string | null;
  active: boolean;
}
interface ObligationRow extends Record<string, unknown> {
  id: string;
  coach_id: string;
  period: string;
  agreed_amount: string;
  due_on: string | null;
  adjustment_total?: string;
  paid?: string;
  balance?: string;
}
interface PaymentRow extends Record<string, unknown> {
  id: string;
  amount: string;
  paid_on: string;
  payment_method: string | null;
  reference: string | null;
  created_at: string | Date;
  request_hash?: string;
}
interface AdjustmentRow extends Record<string, unknown> {
  id: string;
  amount_delta: string;
  reason: string;
  created_at: string | Date;
  request_hash?: string;
}

class CoachRuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "CoachRuleError";
  }
}

function normalizeMoney(value: string): string {
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = raw.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  return `${negative ? "-" : ""}${normalizedWhole}.${fraction.padEnd(2, "0")}`;
}

function keyFrom(request: { headers: Record<string, unknown> }, reply: FastifyReply): string | null {
  const key = request.headers["idempotency-key"];
  if (typeof key === "string" && /^[A-Za-z0-9._:-]{8,100}$/.test(key)) return key;
  reply.code(400).send({
    error: "idempotency_key_required",
    message: "Provide an Idempotency-Key header between 8 and 100 safe characters."
  });
  return null;
}

function mapError(reply: FastifyReply, error: unknown) {
  if (error instanceof CoachRuleError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  const dbCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (dbCode === "23514" || dbCode === "23502") return reply.code(400).send({
    error: "invalid_coach_financial_record",
    message: "One or more fields violate a data constraint."
  });
  if (dbCode === "23505") return reply.code(409).send({
    error: "coach_financial_conflict",
    message: "The operation conflicts with an existing record."
  });
  throw error;
}

async function obligationSummary(db: Database, obligationId: string): Promise<ObligationRow | null> {
  const result = await db.query<ObligationRow>(
    `SELECT o.id, o.coach_id, o.period::text AS period,
            o.agreed_amount::numeric(18,2)::text AS agreed_amount,
            o.due_on::text AS due_on,
            COALESCE((SELECT SUM(a.amount_delta) FROM coach_obligation_adjustments a WHERE a.obligation_id = o.id), 0)::numeric(18,2)::text AS adjustment_total,
            COALESCE((SELECT SUM(p.amount) FROM coach_payments p WHERE p.obligation_id = o.id), 0)::numeric(18,2)::text AS paid,
            (o.agreed_amount
              + COALESCE((SELECT SUM(a.amount_delta) FROM coach_obligation_adjustments a WHERE a.obligation_id = o.id), 0)
              - COALESCE((SELECT SUM(p.amount) FROM coach_payments p WHERE p.obligation_id = o.id), 0)
            )::numeric(18,2)::text AS balance
       FROM coach_obligations o
      WHERE o.id = $1
      LIMIT 1`,
    [obligationId]
  );
  return result.rows[0] ?? null;
}

export function registerCoachRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get("/api/v1/coaches", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({
      error: "unauthenticated",
      message: "A valid session is required."
    });
    if (!actor.roles.includes("admin")) return reply.code(403).send({
      error: "forbidden",
      message: "Administrator permission is required."
    });
    const coaches = await db.query<CoachRow>(
      "SELECT id, full_name, discipline, email, phone, active FROM coach_profiles ORDER BY lower(full_name), id"
    );
    return reply.send({ coaches: coaches.rows });
  });

  app.post<{ Body: CreateCoachBody }>(
    "/api/v1/coaches",
    {
      schema: {
        body: {
          type: "object",
          required: ["full_name", "discipline"],
          additionalProperties: false,
          properties: {
            full_name: { type: "string", minLength: 1, maxLength: 120 },
            discipline: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", format: "email", maxLength: 254 },
            phone: { type: "string", maxLength: 40 }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!actor.roles.includes("admin")) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission is required."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      const fullName = request.body.full_name.trim();
      const discipline = request.body.discipline.trim();
      if (!fullName || !discipline) return reply.code(400).send({
        error: "invalid_coach",
        message: "Name and discipline cannot be empty."
      });
      try {
        const coach = await transactionalDb.transaction(async (tx) => {
          const inserted = await tx.query<CoachRow>(
            `INSERT INTO coach_profiles (full_name, discipline, email, phone, active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id, full_name, discipline, email, phone, active`,
            [fullName, discipline, request.body.email?.trim().toLowerCase() ?? null, request.body.phone?.trim() ?? null]
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("Coach insert did not return a row.");
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
             VALUES ($1, 'coach.created', 'coach_profile', $2, $3, $4::jsonb)`,
            [actor.userId, row.id, request.id, JSON.stringify({ discipline: row.discipline, active: row.active })]
          );
          return row;
        });
        return reply.code(201).send({ coach });
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );

  app.get<{ Params: CoachParams; Querystring: ObligationQuery }>(
    "/api/v1/coaches/:id/obligations",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        },
        querystring: {
          type: "object",
          required: ["period"],
          additionalProperties: false,
          properties: { period: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      const isOwnCoach = actor.roles.includes("coach") && actor.coachId === request.params.id;
      if (!actor.roles.includes("admin") && !isOwnCoach) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      const period = `${request.query.period}-01`;
      const found = await db.query<ObligationRow>(
        "SELECT id FROM coach_obligations WHERE coach_id = $1 AND period = $2::date LIMIT 1",
        [request.params.id, period]
      );
      const obligationId = found.rows[0]?.id;
      if (!obligationId) {
        return reply.send({
          configured: false,
          period: request.query.period,
          obligation: null,
          paid: "0.00",
          adjustmentTotal: "0.00",
          balance: null,
          payments: [],
          adjustments: []
        });
      }

      const [summary, payments, adjustments] = await Promise.all([
        obligationSummary(db, obligationId),
        db.query<PaymentRow>(
          `SELECT id, amount::numeric(18,2)::text AS amount, paid_on::text AS paid_on,
                  payment_method, reference, created_at
             FROM coach_payments
            WHERE obligation_id = $1
            ORDER BY paid_on DESC, created_at DESC, id DESC`,
          [obligationId]
        ),
        db.query<AdjustmentRow>(
          `SELECT id, amount_delta::numeric(18,2)::text AS amount_delta, reason, created_at
             FROM coach_obligation_adjustments
            WHERE obligation_id = $1
            ORDER BY created_at DESC, id DESC`,
          [obligationId]
        )
      ]);
      return reply.send({
        configured: Boolean(summary),
        period: request.query.period,
        obligation: summary,
        paid: summary?.paid ?? "0.00",
        adjustmentTotal: summary?.adjustment_total ?? "0.00",
        balance: summary?.balance ?? null,
        payments: payments.rows,
        adjustments: adjustments.rows
      });
    }
  );

  app.post<{ Params: CoachParams; Body: CreateObligationBody }>(
    "/api/v1/coaches/:id/obligations",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          required: ["period", "agreed_amount"],
          additionalProperties: false,
          properties: {
            period: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            agreed_amount: { type: "string", pattern: "^\\d{1,10}(?:\\.\\d{1,2})?$", maxLength: 13 },
            due_on: { type: "string", format: "date" }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!actor.roles.includes("admin")) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission is required."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      const amount = normalizeMoney(request.body.agreed_amount);
      if (Number(amount) < 0) return reply.code(400).send({
        error: "invalid_amount",
        message: "The agreed monthly amount cannot be negative."
      });
      const period = `${request.body.period}-01`;
      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const coach = await tx.query<{ id: string } & Record<string, unknown>>(
            "SELECT id FROM coach_profiles WHERE id = $1 FOR UPDATE",
            [request.params.id]
          );
          if (!coach.rows[0]) throw new CoachRuleError(404, "not_found", "The requested coach was not found.");

          const existing = await tx.query<ObligationRow>(
            `SELECT id, coach_id, period::text AS period, agreed_amount::numeric(18,2)::text AS agreed_amount, due_on::text AS due_on
               FROM coach_obligations
              WHERE coach_id = $1 AND period = $2::date
              LIMIT 1
              FOR UPDATE`,
            [request.params.id, period]
          );
          if (existing.rows[0]) {
            const row = existing.rows[0];
            if (normalizeMoney(row.agreed_amount) !== amount || (row.due_on ?? null) !== (request.body.due_on ?? null)) {
              throw new CoachRuleError(409, "obligation_already_configured", "An obligation already exists for this coach and period with different terms.");
            }
            return { obligation: row, replayed: true };
          }

          const inserted = await tx.query<ObligationRow>(
            `INSERT INTO coach_obligations (coach_id, period, agreed_amount, due_on, created_by)
             VALUES ($1, $2::date, $3, $4, $5)
             RETURNING id, coach_id, period::text AS period, agreed_amount::numeric(18,2)::text AS agreed_amount, due_on::text AS due_on`,
            [request.params.id, period, amount, request.body.due_on ?? null, actor.userId]
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("Coach obligation insert did not return a row.");
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
             VALUES ($1, 'coach.obligation_created', 'coach_obligation', $2, $3, $4::jsonb)`,
            [actor.userId, row.id, request.id, JSON.stringify({ period: request.body.period, agreedAmount: amount, dueOn: request.body.due_on ?? null })]
          );
          return { obligation: row, replayed: false };
        });
        const summary = await obligationSummary(db, result.obligation.id);
        return reply.code(result.replayed ? 200 : 201).send({ ...result, summary });
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );

  app.post<{ Params: ObligationParams; Body: PaymentBody }>(
    "/api/v1/coach-obligations/:id/payments",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          required: ["amount", "paid_on"],
          additionalProperties: false,
          properties: {
            amount: { type: "string", pattern: "^\\d{1,10}(?:\\.\\d{1,2})?$", maxLength: 13 },
            paid_on: { type: "string", format: "date" },
            payment_method: { type: "string", maxLength: 80 },
            reference: { type: "string", maxLength: 120 }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!actor.roles.includes("admin")) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission is required."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
      const key = keyFrom(request, reply);
      if (!key) return;

      const amount = normalizeMoney(request.body.amount);
      if (Number(amount) <= 0) return reply.code(400).send({
        error: "invalid_amount",
        message: "A payment amount must be greater than zero."
      });
      const canonical = {
        obligationId: request.params.id,
        amount,
        paidOn: request.body.paid_on,
        paymentMethod: request.body.payment_method?.trim() ?? null,
        reference: request.body.reference?.trim() ?? null
      };
      const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const obligation = await tx.query<{ id: string } & Record<string, unknown>>(
            "SELECT id FROM coach_obligations WHERE id = $1 FOR UPDATE",
            [request.params.id]
          );
          if (!obligation.rows[0]) throw new CoachRuleError(404, "not_found", "The monthly obligation was not found.");

          const inserted = await tx.query<PaymentRow>(
            `INSERT INTO coach_payments
               (obligation_id, amount, paid_on, payment_method, reference, recorded_by, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (recorded_by, idempotency_key) WHERE idempotency_key IS NOT NULL
             DO NOTHING
             RETURNING id, amount::numeric(18,2)::text AS amount, paid_on::text AS paid_on,
                       payment_method, reference, created_at, request_hash`,
            [request.params.id, amount, request.body.paid_on, canonical.paymentMethod, canonical.reference, actor.userId, key, requestHash]
          );
          let payment = inserted.rows[0];
          let replayed = false;
          if (!payment) {
            const existing = await tx.query<PaymentRow>(
              `SELECT id, amount::numeric(18,2)::text AS amount, paid_on::text AS paid_on,
                      payment_method, reference, created_at, request_hash
                 FROM coach_payments WHERE recorded_by = $1 AND idempotency_key = $2 LIMIT 1`,
              [actor.userId, key]
            );
            payment = existing.rows[0];
            if (!payment) throw new Error("Idempotent coach payment insert returned no row.");
            if (payment.request_hash !== requestHash) throw new CoachRuleError(409, "idempotency_conflict", "This Idempotency-Key was already used with a different request.");
            replayed = true;
          } else {
            await tx.query(
              `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
               VALUES ($1, 'coach.payment_recorded', 'coach_payment', $2, $3, $4::jsonb)`,
              [actor.userId, payment.id, request.id, JSON.stringify({ obligationId: request.params.id, amount, paidOn: request.body.paid_on })]
            );
          }
          return { payment, replayed };
        });
        const summary = await obligationSummary(db, request.params.id);
        return reply.code(result.replayed ? 200 : 201).send({
          ...result,
          summary,
          receiptType: "internal"
        });
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );

  app.post<{ Params: ObligationParams; Body: AdjustmentBody }>(
    "/api/v1/coach-obligations/:id/adjustments",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          required: ["amount_delta", "reason"],
          additionalProperties: false,
          properties: {
            amount_delta: { type: "string", pattern: "^-?\\d{1,10}(?:\\.\\d{1,2})?$", maxLength: 14 },
            reason: { type: "string", minLength: 3, maxLength: 240 }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await resolveActor(request, db);
      if (!actor) return reply.code(401).send({
        error: "unauthenticated",
        message: "A valid session is required."
      });
      if (!actor.roles.includes("admin")) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission is required."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
      const key = keyFrom(request, reply);
      if (!key) return;

      const amountDelta = normalizeMoney(request.body.amount_delta);
      if (Number(amountDelta) === 0) return reply.code(400).send({
        error: "invalid_adjustment",
        message: "An adjustment must be non-zero."
      });
      const reason = request.body.reason.trim();
      if (reason.length < 3) return reply.code(400).send({
        error: "invalid_adjustment",
        message: "A reason is required for the adjustment."
      });
      const canonical = { obligationId: request.params.id, amountDelta, reason };
      const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const obligation = await tx.query<{ id: string } & Record<string, unknown>>(
            "SELECT id FROM coach_obligations WHERE id = $1 FOR UPDATE",
            [request.params.id]
          );
          if (!obligation.rows[0]) throw new CoachRuleError(404, "not_found", "The monthly obligation was not found.");

          const inserted = await tx.query<AdjustmentRow>(
            `INSERT INTO coach_obligation_adjustments
               (obligation_id, amount_delta, reason, recorded_by, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (recorded_by, idempotency_key) WHERE idempotency_key IS NOT NULL
             DO NOTHING
             RETURNING id, amount_delta::numeric(18,2)::text AS amount_delta, reason, created_at, request_hash`,
            [request.params.id, amountDelta, reason, actor.userId, key, requestHash]
          );
          let adjustment = inserted.rows[0];
          let replayed = false;
          if (!adjustment) {
            const existing = await tx.query<AdjustmentRow>(
              `SELECT id, amount_delta::numeric(18,2)::text AS amount_delta, reason, created_at, request_hash
                 FROM coach_obligation_adjustments WHERE recorded_by = $1 AND idempotency_key = $2 LIMIT 1`,
              [actor.userId, key]
            );
            adjustment = existing.rows[0];
            if (!adjustment) throw new Error("Idempotent adjustment insert returned no row.");
            if (adjustment.request_hash !== requestHash) throw new CoachRuleError(409, "idempotency_conflict", "This Idempotency-Key was already used with a different request.");
            replayed = true;
          } else {
            await tx.query(
              `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
               VALUES ($1, 'coach.obligation_adjusted', 'coach_obligation_adjustment', $2, $3, $4::jsonb)`,
              [actor.userId, adjustment.id, request.id, JSON.stringify({ obligationId: request.params.id, amountDelta, reason })]
            );
          }
          return { adjustment, replayed };
        });
        const summary = await obligationSummary(db, request.params.id);
        return reply.code(result.replayed ? 200 : 201).send({ ...result, summary });
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );
}
