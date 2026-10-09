import type { FastifyInstance } from "fastify";
import type { Database } from "../db.js";
import { canAccessMember, coachHasMemberScope, resolveActor } from "../security/actor.js";

interface MemberParams {
  id: string;
}

interface MemberListQuery {
  limit?: number;
  offset?: number;
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

export function registerMemberRoutes(
  app: FastifyInstance,
  db: Database
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
        // Avoid confirming the existence of profiles outside the caller's scope.
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

      if (actor.roles.includes("admin")) return reply.send({ member });
      if (actor.roles.includes("member") && actor.memberId === targetId) {
        const { dni: _dni, notes: _notes, ...ownProfile } = member;
        return reply.send({ member: ownProfile });
      }

      // Coaches get the minimum profile information needed to supervise assigned members.
      return reply.send({
        member: {
          id: member.id,
          full_name: member.full_name,
          phone: member.phone,
          emergency_contact_name: member.emergency_contact_name,
          emergency_contact_phone: member.emergency_contact_phone,
          status: member.status
        }
      });
    }
  );
}
