import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface MemberParams { id: string }
interface ServiceParams { id: string }
interface MembershipParams { id: string }
interface CreateServiceBody {
  name: string;
  description?: string;
  currentPrice?: string;
}
interface PatchServiceBody {
  name?: string;
  description?: string;
  currentPrice?: string | null;
  active?: boolean;
}
interface CreateMembershipBody {
  serviceId: string;
  startsOn: string;
  endsOn?: string;
  billingPeriod: "weekly" | "monthly" | "quarterly" | "annual" | "custom";
  agreedPrice: string;
  status?: "scheduled" | "active";
}
interface EndMembershipBody { endedOn: string }

class MembershipError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "MembershipError";
  }
}

function validMoney(value: string): boolean {
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value);
}

function canonicalMoney(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function mapError(reply: FastifyReply, error: unknown) {
  if (error instanceof MembershipError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  const dbCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (dbCode === "23505") {
    return reply.code(409).send({
      error: "membership_conflict",
      message: "The operation conflicts with an existing service or membership."
    });
  }
  if (dbCode === "23514" || dbCode === "23502" || dbCode === "22P02") {
    return reply.code(400).send({
      error: "invalid_membership_data",
      message: "One or more fields are invalid."
    });
  }
  throw error;
}

export function registerMembershipRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get("/api/v1/services", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    const result = await db.query(
      `SELECT id, name, description, active, current_price::numeric(12,2)::text AS current_price
         FROM services
        WHERE active = true OR $1::boolean = true
        ORDER BY lower(name), id`,
      [actor.roles.includes("admin")]
    );
    return reply.send({ services: result.rows });
  });

  app.post<{ Body: CreateServiceBody }>("/api/v1/services", {
    schema: {
      body: {
        type: "object", required: ["name"], additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 2000 },
          currentPrice: { type: "string", pattern: "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?$", maxLength: 13 }
        }
      }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const name = request.body.name.trim();
    const description = request.body.description?.trim() || null;
    const price = request.body.currentPrice ?? null;
    if (!name || (price !== null && !validMoney(price))) {
      return reply.code(400).send({ error: "invalid_service", message: "Provide a service name and a non-negative price with up to two decimal places." });
    }
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO services (name, description, current_price)
           VALUES ($1, $2, $3)
           RETURNING id, name, description, active, current_price::numeric(12,2)::text AS current_price`,
          [name, description, price]
        );
        const service = inserted.rows[0];
        if (!service) throw new Error("Service insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data) VALUES ($1,'service.created','service',$2,$3,$4::jsonb)",
          [actor.userId, String(service.id), request.id, JSON.stringify({ name, description, currentPrice: price })]
        );
        return service;
      });
      return reply.code(201).send({ service: result });
    } catch (error) {
      return mapError(reply, error);
    }
  });

  app.patch<{ Params: ServiceParams; Body: PatchServiceBody }>("/api/v1/services/:id", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object", minProperties: 1, additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 2000 },
          currentPrice: { anyOf: [{ type: "string", pattern: "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?$", maxLength: 13 }, { type: "null" }] },
          active: { type: "boolean" }
        }
      }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const body = request.body;
    if (body.currentPrice !== undefined && body.currentPrice !== null && !validMoney(body.currentPrice)) {
      return reply.code(400).send({ error: "invalid_service", message: "The service price is invalid." });
    }
    const columns: Record<string, string> = {
      name: "name", description: "description", currentPrice: "current_price", active: "active"
    };
    const entries = Object.entries(body).filter(([, value]) => value !== undefined);
    if (!entries.length) return reply.code(400).send({ error: "empty_patch", message: "Provide at least one field to update." });
    const sets = entries.map(([key], index) => `${columns[key]} = $${index + 1}`);
    const values = entries.map(([key, value]) => key === "name" || key === "description"
      ? (typeof value === "string" ? value.trim() || null : value)
      : key === "currentPrice" ? value : value);
    values.push(request.params.id);
    try {
      const updated = await transactionalDb.transaction(async (tx) => {
        const current = await tx.query("SELECT id, name, description, active, current_price::numeric(12,2)::text AS current_price FROM services WHERE id=$1 FOR UPDATE", [request.params.id]);
        const before = current.rows[0];
        if (!before) throw new MembershipError(404, "service_not_found", "The service was not found.");
        const result = await tx.query(
          `UPDATE services SET ${sets.join(", ")}, updated_at=now() WHERE id=$${values.length}
           RETURNING id, name, description, active, current_price::numeric(12,2)::text AS current_price`,
          values
        );
        const after = result.rows[0];
        if (!after) throw new Error("Service update did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1,'service.updated','service',$2,$3,$4::jsonb,$5::jsonb)",
          [
            actor.userId,
            request.params.id,
            request.id,
            JSON.stringify({ changedFields: Object.keys(body) }),
            JSON.stringify({ active: after.active, currentPrice: after.current_price })
          ]
        );
        return after;
      });
      return reply.send({ service: updated });
    } catch (error) {
      return mapError(reply, error);
    }
  });

  app.get<{ Params: MemberParams }>("/api/v1/members/:id/memberships", {
    schema: { params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    const memberId = request.params.id;
    const isOwner = actor.roles.includes("member") && actor.memberId === memberId;
    if (!actor.roles.includes("admin") && !isOwner) return reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });
    const result = await db.query(
      `SELECT m.id, m.member_id, m.service_id, s.name AS service_name,
              m.starts_on::text AS starts_on, m.ends_on::text AS ends_on,
              m.billing_period, m.agreed_price::numeric(12,2)::text AS agreed_price, m.status, m.created_at
         FROM memberships m JOIN services s ON s.id=m.service_id
        WHERE m.member_id=$1
        ORDER BY m.starts_on DESC, m.created_at DESC`,
      [memberId]
    );
    return reply.send({ memberId, memberships: result.rows });
  });

  app.post<{ Params: MemberParams; Body: CreateMembershipBody }>("/api/v1/members/:id/memberships", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object", required: ["serviceId", "startsOn", "billingPeriod", "agreedPrice"], additionalProperties: false,
        properties: {
          serviceId: { type: "string", format: "uuid" },
          startsOn: { type: "string", format: "date" },
          endsOn: { type: "string", format: "date" },
          billingPeriod: { type: "string", enum: ["weekly", "monthly", "quarterly", "annual", "custom"] },
          agreedPrice: { type: "string", pattern: "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?$", maxLength: 13 },
          status: { type: "string", enum: ["scheduled", "active"] }
        }
      }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const body = request.body;
    if (!validMoney(body.agreedPrice) || (body.endsOn && body.endsOn < body.startsOn)) {
      return reply.code(400).send({ error: "invalid_membership", message: "The price or membership dates are invalid." });
    }
    const status = body.status ?? (body.startsOn > new Date().toISOString().slice(0, 10) ? "scheduled" : "active");
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const member = await tx.query("SELECT id FROM member_profiles WHERE id=$1 FOR UPDATE", [request.params.id]);
        if (!member.rows[0]) throw new MembershipError(404, "member_not_found", "The member was not found.");
        const service = await tx.query("SELECT id FROM services WHERE id=$1 AND active=true FOR SHARE", [body.serviceId]);
        if (!service.rows[0]) throw new MembershipError(404, "service_not_found", "The active service was not found.");
        const existing = await tx.query(
          `SELECT id, member_id, service_id, starts_on::text AS starts_on, ends_on::text AS ends_on,
                  billing_period, agreed_price::numeric(12,2)::text AS agreed_price, status
             FROM memberships
            WHERE member_id=$1 AND service_id=$2 AND starts_on=$3::date
            LIMIT 1 FOR UPDATE`,
          [request.params.id, body.serviceId, body.startsOn]
        );
        if (existing.rows[0]) {
          const row = existing.rows[0] as Record<string, unknown>;
          const same = row.ends_on === (body.endsOn ?? null) &&
            row.billing_period === body.billingPeriod &&
            canonicalMoney(String(row.agreed_price)) === canonicalMoney(body.agreedPrice) &&
            row.status === status;
          if (!same) throw new MembershipError(409, "membership_conflict", "A membership already exists for this service and start date with different terms.");
          return { membership: row, replayed: true };
        }
        const inserted = await tx.query(
          `INSERT INTO memberships (member_id, service_id, starts_on, ends_on, billing_period, agreed_price, status, created_by)
           VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8)
           RETURNING id, member_id, service_id, starts_on::text AS starts_on, ends_on::text AS ends_on,
                     billing_period, agreed_price::numeric(12,2)::text AS agreed_price, status, created_at`,
          [request.params.id, body.serviceId, body.startsOn, body.endsOn ?? null, body.billingPeriod, body.agreedPrice, status, actor.userId]
        );
        const membership = inserted.rows[0];
        if (!membership) throw new Error("Membership insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, after_data) VALUES ($1,'membership.created','membership',$2,$3,$4::jsonb)",
          [actor.userId, String(membership.id), request.id, JSON.stringify({ memberId: request.params.id, serviceId: body.serviceId, startsOn: body.startsOn, endsOn: body.endsOn ?? null, billingPeriod: body.billingPeriod, agreedPrice: body.agreedPrice, status })]
        );
        return { membership, replayed: false };
      });
      return reply.code(result.replayed ? 200 : 201).send(result);
    } catch (error) {
      return mapError(reply, error);
    }
  });

  app.post<{ Params: MembershipParams; Body: EndMembershipBody }>("/api/v1/memberships/:id/end", {
    schema: {
      params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", required: ["endedOn"], additionalProperties: false, properties: { endedOn: { type: "string", format: "date" } } }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const current = await tx.query(
          "SELECT id, member_id, service_id, starts_on::text AS starts_on, ends_on::text AS ends_on, status FROM memberships WHERE id=$1 FOR UPDATE",
          [request.params.id]
        );
        const before = current.rows[0] as Record<string, unknown> | undefined;
        if (!before) throw new MembershipError(404, "membership_not_found", "The membership was not found.");
        if (String(request.body.endedOn) < String(before.starts_on)) {
          throw new MembershipError(400, "invalid_end_date", "The end date cannot be before the start date.");
        }
        if (before.status === "ended") {
          if (before.ends_on === request.body.endedOn) return { membership: before, replayed: true };
          throw new MembershipError(409, "membership_already_ended", "The membership has already been ended with a different date.");
        }
        const updated = await tx.query(
          "UPDATE memberships SET status='ended', ends_on=$2::date WHERE id=$1 RETURNING id, member_id, service_id, starts_on::text AS starts_on, ends_on::text AS ends_on, billing_period, agreed_price::numeric(12,2)::text AS agreed_price, status",
          [request.params.id, request.body.endedOn]
        );
        const membership = updated.rows[0];
        if (!membership) throw new Error("Membership end did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1,'membership.ended','membership',$2,$3,$4::jsonb,$5::jsonb)",
          [actor.userId, request.params.id, request.id, JSON.stringify(before), JSON.stringify(membership)]
        );
        return { membership, replayed: false };
      });
      return reply.send(result);
    } catch (error) {
      return mapError(reply, error);
    }
  });
}
