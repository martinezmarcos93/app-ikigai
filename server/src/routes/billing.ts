import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import type { PushSender } from "../domain/web-push.js";
import { monthLabel, runDailyBilling, todayIn } from "../domain/billing.js";
import { resolveActor } from "../security/actor.js";
import { constantTimeStringEqual, requireCsrf } from "../security/csrf.js";

interface RulesBody {
  default_due_day?: number;
  grace_days?: number;
  late_fee_percent?: string | null;
  due_reminders_enabled?: boolean;
}
interface IdParams { id: string }
interface DueDayBody { due_day: number | null }
interface ProposalQuery { status?: "pending" | "approved" | "dismissed" }

const unauthenticated = { error: "unauthenticated", message: "A valid session is required." };
const forbidden = { error: "forbidden", message: "Administrator permission is required." };
const notFound = { error: "not_found", message: "The requested resource was not found." };
const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;

const RULES_SELECT = `SELECT default_due_day, grace_days, late_fee_percent::text AS late_fee_percent,
  late_fees_since::text AS late_fees_since, due_reminders_enabled, updated_at FROM billing_rules WHERE id = 1`;
const PROPOSAL_SELECT = `SELECT p.id, p.member_id, mp.full_name AS member_name, p.period::text AS period, p.due_on::text AS due_on,
  p.cutoff_on::text AS cutoff_on, p.debt_amount::text AS debt_amount, p.percent::text AS percent, p.fee_amount::text AS fee_amount,
  p.status, p.ledger_entry_id, p.decided_at, p.created_at
  FROM late_fee_proposals p JOIN member_profiles mp ON mp.id = p.member_id`;

class BillingError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) { super(message); }
}

export function registerBillingRoutes(
  app: FastifyInstance, db: Database, transactionalDb: TransactionalDatabase, config: AppConfig, pushSender: PushSender | undefined
): void {
  async function admin(request: Parameters<typeof resolveActor>[0], reply: import("fastify").FastifyReply, csrf: boolean) {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) { reply.code(401).send(unauthenticated); return null; }
    if (!actor.roles.includes("admin")) { reply.code(403).send(forbidden); return null; }
    if (csrf && !requireCsrf(request, reply, actor.sessionToken, config)) return null;
    return actor;
  }

  // ---- Reglas generales ----
  app.get("/api/v1/admin/billing-rules", async (request, reply) => {
    if (!(await admin(request, reply, false))) return;
    const result = await db.query(RULES_SELECT);
    return reply.send({ rules: result.rows[0] });
  });

  app.patch<{ Body: RulesBody }>("/api/v1/admin/billing-rules", {
    schema: {
      body: {
        type: "object", minProperties: 1, additionalProperties: false,
        properties: {
          default_due_day: { type: "integer", minimum: 1, maximum: 28 },
          grace_days: { type: "integer", minimum: 0, maximum: 15 },
          late_fee_percent: { anyOf: [{ type: "string", pattern: "^(100(\\.0{1,2})?|[1-9]?\\d(\\.\\d{1,2})?)$" }, { type: "null" }] },
          due_reminders_enabled: { type: "boolean" }
        }
      }
    }
  }, async (request, reply) => {
    const actor = await admin(request, reply, true);
    if (!actor) return;
    const body = request.body;
    if (body.late_fee_percent !== undefined && body.late_fee_percent !== null && Number(body.late_fee_percent) <= 0) {
      return reply.code(400).send({ error: "invalid_late_fee_percent", message: "The late fee percent must be greater than zero, or null to disable it." });
    }
    const today = todayIn(config.gymTimezone);
    const rules = await transactionalDb.transaction(async (tx) => {
      const before = (await tx.query(`${RULES_SELECT} FOR UPDATE`)).rows[0] as Record<string, unknown>;
      const sets: string[] = [];
      const values: unknown[] = [];
      const put = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
      if (body.default_due_day !== undefined) put("default_due_day", body.default_due_day);
      if (body.grace_days !== undefined) put("grace_days", body.grace_days);
      if (body.due_reminders_enabled !== undefined) put("due_reminders_enabled", body.due_reminders_enabled);
      if (body.late_fee_percent !== undefined) {
        put("late_fee_percent", body.late_fee_percent);
        // Al activar los recargos se cuenta desde hoy: no se proponen recargos de meses anteriores.
        if (body.late_fee_percent === null) put("late_fees_since", null);
        else if (before.late_fees_since == null) put("late_fees_since", today);
      }
      put("updated_by", actor.userId);
      const after = (await tx.query(`UPDATE billing_rules SET ${sets.join(", ")}, updated_at = now() WHERE id = 1 RETURNING default_due_day, grace_days,
        late_fee_percent::text AS late_fee_percent, late_fees_since::text AS late_fees_since, due_reminders_enabled, updated_at`, values)).rows[0];
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'billing.rules_updated','billing_rules','1',$2,$3::jsonb,$4::jsonb)",
        [actor.userId, request.id, JSON.stringify(before), JSON.stringify(after)]
      );
      return after;
    });
    return reply.send({ rules });
  });

  // ---- Vencimiento por persona ----
  app.patch<{ Params: IdParams; Body: DueDayBody }>("/api/v1/memberships/:id/due-day", {
    schema: {
      params: idParams,
      body: { type: "object", required: ["due_day"], additionalProperties: false, properties: { due_day: { anyOf: [{ type: "integer", minimum: 1, maximum: 28 }, { type: "null" }] } } }
    }
  }, async (request, reply) => {
    const actor = await admin(request, reply, true);
    if (!actor) return;
    const membership = await transactionalDb.transaction(async (tx) => {
      const before = (await tx.query("SELECT id, due_day FROM memberships WHERE id = $1 FOR UPDATE", [request.params.id])).rows[0];
      if (!before) return null;
      const updated = (await tx.query(
        "UPDATE memberships SET due_day = $2 WHERE id = $1 RETURNING id, member_id, due_day", [request.params.id, request.body.due_day]
      )).rows[0];
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'membership.due_day_set','membership',$2,$3,$4::jsonb,$5::jsonb)",
        [actor.userId, request.params.id, request.id, JSON.stringify({ dueDay: before.due_day }), JSON.stringify({ dueDay: request.body.due_day })]
      );
      return updated;
    });
    if (!membership) return reply.code(404).send(notFound);
    return reply.send({ membership });
  });

  // ---- Propuestas de recargo ----
  app.get<{ Querystring: ProposalQuery }>("/api/v1/admin/late-fee-proposals", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { status: { type: "string", enum: ["pending", "approved", "dismissed"] } } } }
  }, async (request, reply) => {
    if (!(await admin(request, reply, false))) return;
    const result = await db.query(`${PROPOSAL_SELECT} WHERE p.status = $1 ORDER BY p.created_at DESC, p.id LIMIT 200`, [request.query.status ?? "pending"]);
    return reply.send({ proposals: result.rows });
  });

  app.post<{ Params: IdParams }>("/api/v1/admin/late-fee-proposals/:id/approve", { schema: { params: idParams } }, async (request, reply) => {
    const actor = await admin(request, reply, true);
    if (!actor) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const proposal = (await tx.query(
          "SELECT id, member_id, period::text AS period, debt_amount::text AS debt_amount, percent::text AS percent, fee_amount::text AS fee_amount, status, ledger_entry_id FROM late_fee_proposals WHERE id = $1 FOR UPDATE",
          [request.params.id]
        )).rows[0] as Record<string, string> | undefined;
        if (!proposal) throw new BillingError(404, "not_found", "The requested resource was not found.");
        if (proposal.status === "approved") return { ledgerEntryId: proposal.ledger_entry_id, replayed: true };
        if (proposal.status === "dismissed") throw new BillingError(409, "proposal_dismissed", "The late fee proposal was already dismissed.");
        const description = `Recargo por mora ${monthLabel(proposal.period!)} (${proposal.percent}% de $${proposal.debt_amount})`;
        const key = `late-fee:${proposal.id}`;
        const hash = createHash("sha256").update(JSON.stringify({ proposal: proposal.id, amount: proposal.fee_amount })).digest("hex");
        const entry = (await tx.query(
          `INSERT INTO ledger_entries (member_id, entry_type, direction, amount, description, occurred_on, applied_period, created_by, idempotency_key, request_hash)
           VALUES ($1, 'charge', 'debit', $2, $3, $4::date, $5::date, $6, $7, $8) RETURNING id`,
          [proposal.member_id, proposal.fee_amount, description, todayIn(config.gymTimezone), proposal.period, actor.userId, key, hash]
        )).rows[0];
        await tx.query(
          "UPDATE late_fee_proposals SET status = 'approved', ledger_entry_id = $2, decided_by = $3, decided_at = now() WHERE id = $1",
          [proposal.id, entry?.id, actor.userId]
        );
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'billing.late_fee_approved','late_fee_proposal',$2,$3,$4::jsonb)",
          [actor.userId, proposal.id, request.id, JSON.stringify({ memberId: proposal.member_id, period: proposal.period, feeAmount: proposal.fee_amount, ledgerEntryId: entry?.id })]
        );
        return { ledgerEntryId: entry?.id, replayed: false };
      });
      return reply.code(result.replayed ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof BillingError) return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
      throw error;
    }
  });

  app.post<{ Params: IdParams }>("/api/v1/admin/late-fee-proposals/:id/dismiss", { schema: { params: idParams } }, async (request, reply) => {
    const actor = await admin(request, reply, true);
    if (!actor) return;
    const outcome = await transactionalDb.transaction(async (tx) => {
      const proposal = (await tx.query("SELECT id, status FROM late_fee_proposals WHERE id = $1 FOR UPDATE", [request.params.id])).rows[0];
      if (!proposal) return 404;
      if (proposal.status === "dismissed") return 204;
      if (proposal.status === "approved") return 409;
      await tx.query("UPDATE late_fee_proposals SET status = 'dismissed', decided_by = $2, decided_at = now() WHERE id = $1", [request.params.id, actor.userId]);
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id) VALUES ($1,'billing.late_fee_dismissed','late_fee_proposal',$2,$3)",
        [actor.userId, request.params.id, request.id]
      );
      return 204;
    });
    if (outcome === 404) return reply.code(404).send(notFound);
    if (outcome === 409) return reply.code(409).send({ error: "proposal_approved", message: "An approved late fee must be reversed from the account, not dismissed." });
    return reply.code(204).send();
  });

  // ---- Tarea diaria (la dispara el cron del Worker; sin sesion, con token) ----
  app.post("/api/v1/internal/daily", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = request.headers["x-internal-token"];
    if (!config.internalJobToken || typeof token !== "string" || !constantTimeStringEqual(token, config.internalJobToken)) {
      return reply.code(404).send(notFound); // no revela que la ruta existe
    }
    const summary = await runDailyBilling(db, pushSender, request.log, todayIn(config.gymTimezone));
    return reply.send(summary);
  });
}
