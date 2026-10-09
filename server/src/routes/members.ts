import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { canAccessMember, coachHasMemberScope, resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

interface MemberParams {
  id: string;
}

interface MemberListQuery {
  limit?: number;
  offset?: number;
}

interface PatchMemberBody {
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  dni?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  status?: "trial" | "active" | "suspended" | "debtor" | "exited";
  joined_on?: string;
  exited_on?: string;
  notes?: string;
}

interface MemberRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  dni: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
  joined_on: string | null;
  exited_on: string | null;
  notes: string | null;
}

const memberEditableFields = new Set([
  "phone", "address", "emergency_contact_name", "emergency_contact_phone"
]);

const adminEditableColumns: Record<keyof PatchMemberBody, string> = {
  full_name: "full_name",
  email: "email",
  phone: "phone",
  address: "address",
  dni: "dni",
  emergency_contact_name: "emergency_contact_name",
  emergency_contact_phone: "emergency_contact_phone",
  status: "status",
  joined_on: "joined_on",
  exited_on: "exited_on",
  notes: "notes"
};

function memberView(member: MemberRow, roles: string[], targetId: string, ownMemberId: string | null) {
  if (roles.includes("admin")) return member;
  if (roles.includes("member") && ownMemberId === targetId) {
    const { dni: _dni, notes: _notes, ...ownProfile } = member;
    return ownProfile;
  }
  return {
    id: member.id,
    full_name: member.full_name,
    phone: member.phone,
    emergency_contact_name: member.emergency_contact_name,
    emergency_contact_phone: member.emergency_contact_phone,
    status: member.status
  };
}

function invalid(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: "invalid_member_update", message });
}

export function registerMemberRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
  transactionalDb?: TransactionalDatabase
): void {
  app.get<{ Querystring: MemberListQuery }>(
    "/api/v1/members",
    {
      schema: {
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
      if (!actor.roles.includes("admin")) return reply.code(403).send({
        error: "forbidden",
        message: "Administrator permission is required."
      });

      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;
      const totalResult = await db.query<{ total: number } & Record<string, unknown>>(
        "SELECT count(*)::int AS total FROM member_profiles",
        []
      );
      const rows = await db.query<MemberRow>(
        `SELECT id, full_name, email, phone, status, joined_on, exited_on
           FROM member_profiles
          ORDER BY lower(full_name), id
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return reply.send({
        items: rows.rows,
        total: totalResult.rows[0]?.total ?? 0,
        limit,
        offset
      });
    }
  );

  app.get<{ Params: MemberParams }>(
    "/api/v1/members/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", format: "uuid" } }
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

      const targetId = request.params.id;
      let coachScopeAllowed = false;
      if (!actor.roles.includes("admin") &&
          !(actor.roles.includes("member") && actor.memberId === targetId) &&
          actor.roles.includes("coach") &&
          actor.coachId) {
        coachScopeAllowed = await coachHasMemberScope(db, actor.coachId, targetId);
      }
      if (!canAccessMember(actor, targetId, coachScopeAllowed)) {
        return reply.code(404).send({
          error: "not_found",
          message: "The requested resource was not found."
        });
      }

      const result = await db.query<MemberRow>(
        `SELECT id, full_name, email, phone, address, dni,
                emergency_contact_name, emergency_contact_phone,
                status, joined_on, exited_on, notes
           FROM member_profiles
          WHERE id = $1
          LIMIT 1`,
        [targetId]
      );
      const member = result.rows[0];
      if (!member) return reply.code(404).send({
        error: "not_found",
        message: "The requested resource was not found."
      });

      return reply.send({
        member: memberView(member, actor.roles, targetId, actor.memberId)
      });
    }
  );

  if (!transactionalDb) return;

  app.patch<{ Params: MemberParams; Body: PatchMemberBody }>(
    "/api/v1/members/:id",
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
          minProperties: 1,
          additionalProperties: false,
          properties: {
            full_name: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", format: "email", maxLength: 254 },
            phone: { type: "string", maxLength: 40 },
            address: { type: "string", maxLength: 240 },
            dni: { type: "string", maxLength: 30 },
            emergency_contact_name: { type: "string", maxLength: 120 },
            emergency_contact_phone: { type: "string", maxLength: 40 },
            status: { type: "string", enum: ["trial", "active", "suspended", "debtor", "exited"] },
            joined_on: { type: "string", format: "date" },
            exited_on: { type: "string", format: "date" },
            notes: { type: "string", maxLength: 2000 }
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

      const targetId = request.params.id;
      const isAdmin = actor.roles.includes("admin");
      const isOwner = actor.roles.includes("member") && actor.memberId === targetId;
      if (!isAdmin && !isOwner) {
        return reply.code(404).send({
          error: "not_found",
          message: "The requested resource was not found."
        });
      }

      const bodyEntries = Object.entries(request.body).filter(([, value]) => value !== undefined);
      if (!isAdmin && bodyEntries.some(([key]) => !memberEditableFields.has(key))) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Members can only edit their contact information."
        });
      }
      if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

      const normalized: Partial<PatchMemberBody> = {};
      for (const [key, value] of bodyEntries) {
        if (typeof value !== "string") continue;
        const typedKey = key as keyof PatchMemberBody;
        normalized[typedKey] = typedKey === "email"
          ? value.trim().toLowerCase()
          : ["full_name", "phone", "address", "dni", "emergency_contact_name", "emergency_contact_phone", "notes"].includes(key)
            ? value.trim()
            : value;
      }
      if (normalized.full_name !== undefined && !normalized.full_name) {
        return invalid(reply, "El nombre no puede quedar vacío.");
      }

      const updated = await transactionalDb.transaction(async (tx) => {
          const currentResult = await tx.query<MemberRow>(
            `SELECT id, full_name, email, phone, address, dni,
                    emergency_contact_name, emergency_contact_phone,
                    status, joined_on, exited_on, notes
               FROM member_profiles
              WHERE id = $1
              FOR UPDATE`,
            [targetId]
          );
          const current = currentResult.rows[0];
          if (!current) return null;

          const entries = Object.entries(normalized).filter(([key, value]) =>
            value !== undefined && current[key as keyof MemberRow] !== value
          );
          if (entries.length === 0) return current;

          const fields = entries.map(([key]) => key);
          const assignments = entries.map(([key], index) =>
            `${adminEditableColumns[key as keyof PatchMemberBody]} = $${index + 1}`
          );
          const values = entries.map(([, value]) => value);
          values.push(targetId);
          const updateResult = await tx.query<MemberRow>(
            `UPDATE member_profiles
                SET ${assignments.join(", ")}, updated_at = clock_timestamp()
              WHERE id = $${values.length}
              RETURNING id, full_name, email, phone, address, dni,
                        emergency_contact_name, emergency_contact_phone,
                        status, joined_on, exited_on, notes`,
            values
          );
          const updatedMember = updateResult.rows[0];
          if (!updatedMember) throw new Error("Member update did not return a row.");

          const beforeData: Record<string, unknown> = { changedFields: fields };
          const afterData: Record<string, unknown> = { changedFields: fields };
          if (fields.includes("status")) {
            beforeData.status = current.status;
            afterData.status = updatedMember.status;
          }
          await tx.query(
            `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data)
             VALUES ($1, 'member.profile_updated', 'member_profile', $2, $3, $4::jsonb, $5::jsonb)`,
            [
              actor.userId,
              targetId,
              request.id,
              JSON.stringify(beforeData),
              JSON.stringify(afterData)
            ]
          );
          return updatedMember;
        });

        if (!updated) return reply.code(404).send({
          error: "not_found",
          message: "The requested resource was not found."
        });
      return reply.send({
        member: memberView(updated, actor.roles, targetId, actor.memberId)
      });
    }
  );
}
