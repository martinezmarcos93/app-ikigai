import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface MemberParams {
  id: string;
}

interface LedgerQuery {
  limit?: number;
  offset?: number;
}

interface LedgerBody {
  type: "charge" | "payment" | "adjustment" | "refund";
  amount: string;
  description: string;
  occurred_on: string;
  applied_period?: string;
  direction?: "debit" | "credit";
  payment_method?: string;
  reference?: string;
}

interface LedgerRow extends Record<string, unknown> {
  id: string;
  member_id: string;
  entry_type: string;
  direction: string;
  amount: string;
  description: string;
  occurred_on: string;
  applied_period: string | null;
  payment_method: string | null;
  reference: string | null;
  created_at: string | Date;
  request_hash?: string;
}

class LedgerRuleError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "LedgerRuleError";
  }
}

function normalizeAmount(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  return `${normalizedWhole}.${fraction.padEnd(2, "0")}`;
}

function mapError(reply: FastifyReply, error: unknown) {
  if (error instanceof LedgerRuleError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  const dbCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (dbCode === "23514" || dbCode === "23502") {
    return reply.code(400).send({
      error: "invalid_ledger_entry",
      message: "One or more account movement fields are invalid."
    });
  }
  throw error;
}

export function registerLedgerRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get<{ Params: MemberParams; Querystring: LedgerQuery }>(
    "/api/v1/members/:id/ledger-entries",
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
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 }
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
      const memberId = request.params.id;
      const isOwner = actor.roles.includes("member") && actor.memberId === memberId;
      if (!actor.roles.includes("admin") && !isOwner) {
        return reply.code(404).send({
          error: "not_found",
          message: "The requested resource was not found."
        });
      }

      const memberExists = await db.query<{ id: string } & Record<string, unknown>>(
        "SELECT id FROM member_profiles WHERE id = $1",
        [memberId]
      );
      if (!memberExists.rows[0]) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;
      const [entries, total, balance] = await Promise.all([
        db.query<LedgerRow>(
          `SELECT id, member_id, entry_type, direction, amount::text AS amount,
                  description, occurred_on, applied_period, payment_method, reference, created_at
             FROM ledger_entries
            WHERE member_id = $1
            ORDER BY occurred_on DESC, created_at DESC, id DESC
            LIMIT $2 OFFSET $3`,
          [memberId, limit, offset]
        ),
        db.query<{ total: number } & Record<string, unknown>>(
          "SELECT count(*)::int AS total FROM ledger_entries WHERE member_id = $1",
          [memberId]
        ),
        db.query<{ balance: string } & Record<string, unknown>>(
          `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0)::numeric(18,2)::text AS balance
             FROM ledger_entries
            WHERE member_id = $1`,
          [memberId]
        )
      ]);
      return reply.send({
        entries: entries.rows,
        total: total.rows[0]?.total ?? 0,
        balance: balance.rows[0]?.balance ?? "0.00",
        limit,
        offset
      });
    }
  );

  app.post<{ Params: MemberParams; Body: LedgerBody }>(
    "/api/v1/members/:id/ledger-entries",
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
          required: ["type", "amount", "description", "occurred_on"],
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["charge", "payment", "adjustment", "refund"] },
            amount: { type: "string", pattern: "^\\d{1,10}(?:\\.\\d{1,2})?$", maxLength: 13 },
            description: { type: "string", minLength: 1, maxLength: 240 },
            occurred_on: { type: "string", format: "date" },
            applied_period: { type: "string", format: "date" },
            direction: { type: "string", enum: ["debit", "credit"] },
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
        message: "Administrator permission is required to record account movements."
      });
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
        return reply.code(400).send({
          error: "idempotency_key_required",
          message: "Provide an Idempotency-Key header between 8 and 100 safe characters."
        });
      }

      const body = request.body;
      const amount = normalizeAmount(body.amount);
      if (Number(amount) <= 0) return reply.code(400).send({
        error: "invalid_amount",
        message: "The amount must be greater than zero."
      });
      let direction: "debit" | "credit";
      if (body.type === "charge") direction = "debit";
      else if (body.type === "payment" || body.type === "refund") direction = "credit";
      else if (body.direction) direction = body.direction;
      else return reply.code(400).send({
        error: "adjustment_direction_required",
        message: "An adjustment must explicitly specify debit or credit."
      });
      if (body.type !== "adjustment" && body.direction && body.direction !== direction) {
        return reply.code(400).send({
          error: "invalid_direction",
          message: "The direction is determined by the selected movement type."
        });
      }

      const description = body.description.trim();
      if (!description) return reply.code(400).send({
        error: "invalid_description",
        message: "The description cannot be empty."
      });
      const canonical = {
        memberId: request.params.id,
        type: body.type,
        direction,
        amount,
        description,
        occurredOn: body.occurred_on,
        appliedPeriod: body.applied_period ?? null,
        paymentMethod: body.payment_method?.trim() ?? null,
        reference: body.reference?.trim() ?? null
      };
      const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

      try {
        const result = await transactionalDb.transaction(async (tx) => {
          const member = await tx.query<{ id: string } & Record<string, unknown>>(
            "SELECT id FROM member_profiles WHERE id = $1 FOR UPDATE",
            [request.params.id]
          );
          if (!member.rows[0]) throw new LedgerRuleError(404, "not_found", "The requested member was not found.");

          const inserted = await tx.query<LedgerRow>(
            `INSERT INTO ledger_entries
               (member_id, entry_type, direction, amount, description, occurred_on, applied_period,
                payment_method, reference, created_by, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL
             DO NOTHING
             RETURNING id, member_id, entry_type, direction, amount::text AS amount,
                       description, occurred_on, applied_period, payment_method, reference, created_at, request_hash`,
            [
              request.params.id,
              body.type,
              direction,
              amount,
              description,
              body.occurred_on,
              body.applied_period ?? null,
              canonical.paymentMethod,
              canonical.reference,
              actor.userId,
              key,
              requestHash
            ]
          );

          let entry = inserted.rows[0];
          let replayed = false;
          if (!entry) {
            const existing = await tx.query<LedgerRow>(
              `SELECT id, member_id, entry_type, direction, amount::text AS amount,
                      description, occurred_on, applied_period, payment_method, reference, created_at, request_hash
                 FROM ledger_entries
                WHERE created_by = $1 AND idempotency_key = $2
                LIMIT 1`,
              [actor.userId, key]
            );
            entry = existing.rows[0];
            if (!entry) throw new Error("Idempotent ledger insert did not return an existing entry.");
            if (entry.request_hash !== requestHash) {
              throw new LedgerRuleError(409, "idempotency_conflict", "This Idempotency-Key was already used with a different request.");
            }
            replayed = true;
          } else {
            await tx.query(
              `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data)
               VALUES ($1, 'ledger.entry_created', 'ledger_entry', $2, $3, $4::jsonb)`,
              [
                actor.userId,
                entry.id,
                request.id,
                JSON.stringify({
                  memberId: request.params.id,
                  type: body.type,
                  direction,
                  amount,
                  appliedPeriod: body.applied_period ?? null
                })
              ]
            );
          }

          const balance = await tx.query<{ balance: string } & Record<string, unknown>>(
            `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0)::numeric(18,2)::text AS balance
               FROM ledger_entries
              WHERE member_id = $1`,
            [request.params.id]
          );
          return {
            entry: {
              id: entry.id,
              member_id: entry.member_id,
              entry_type: entry.entry_type,
              direction: entry.direction,
              amount: entry.amount,
              description: entry.description,
              occurred_on: entry.occurred_on,
              applied_period: entry.applied_period,
              payment_method: entry.payment_method,
              reference: entry.reference,
              created_at: entry.created_at
            },
            balance: balance.rows[0]?.balance ?? "0.00",
            replayed
          };
        });
        return reply.code(result.replayed ? 200 : 201).send({
          ...result,
          receiptType: body.type === "payment" ? "internal" : undefined
        });
      } catch (error) {
        return mapError(reply, error);
      }
    }
  );
}
