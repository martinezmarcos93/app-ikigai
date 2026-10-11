import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor, type AuthenticatedActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

type Audience = "all" | "members" | "coaches";
interface CreateBody { title: string; body: string; audience: Audience }
interface IdParams { id: string }

// Audiencias que ve cada persona: administracion ve todo; el resto, lo general y lo de su rol.
function visibleAudiences(actor: AuthenticatedActor): Audience[] {
  if (actor.roles.includes("admin")) return ["all", "members", "coaches"];
  const audiences: Audience[] = ["all"];
  if (actor.roles.includes("member")) audiences.push("members");
  if (actor.roles.includes("coach")) audiences.push("coaches");
  return audiences;
}

const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;
const unauthenticated = { error: "unauthenticated", message: "A valid session is required." };
const forbidden = { error: "forbidden", message: "Administrator permission is required." };

export function registerAnnouncementRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get("/api/v1/announcements", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    const result = await db.query(
      `SELECT a.id, a.title, a.body, a.audience, a.created_at,
              (r.user_id IS NOT NULL) AS read
         FROM announcements a
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
        WHERE a.archived_at IS NULL AND a.audience = ANY($2::text[])
        ORDER BY a.created_at DESC, a.id
        LIMIT 50`,
      [actor.userId, visibleAudiences(actor)]
    );
    const unread = result.rows.filter((row) => row.read === false).length;
    return reply.send({ announcements: result.rows, unread });
  });

  app.post<{ Body: CreateBody }>("/api/v1/admin/announcements", {
    schema: {
      body: {
        type: "object", required: ["title", "body", "audience"], additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          body: { type: "string", minLength: 1, maxLength: 2000 },
          audience: { type: "string", enum: ["all", "members", "coaches"] }
        }
      }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const title = request.body.title.trim();
    const body = request.body.body.trim();
    if (!title || !body) return reply.code(400).send({ error: "invalid_announcement", message: "Title and body cannot be empty." });
    const announcement = await transactionalDb.transaction(async (tx) => {
      const inserted = await tx.query(
        "INSERT INTO announcements (title, body, audience, created_by) VALUES ($1,$2,$3,$4) RETURNING id, title, body, audience, created_at",
        [title, body, request.body.audience, actor.userId]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Announcement insert did not return a row.");
      // La auditoria guarda a quien va dirigido, no el texto del aviso.
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'announcement.published','announcement',$2,$3,$4::jsonb)",
        [actor.userId, row.id, request.id, JSON.stringify({ audience: request.body.audience })]
      );
      return row;
    });
    return reply.code(201).send({ announcement });
  });

  app.post<{ Params: IdParams }>("/api/v1/announcements/:id/read", { schema: { params: idParams } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const visible = await db.query(
      "SELECT 1 FROM announcements WHERE id=$1 AND archived_at IS NULL AND audience = ANY($2::text[])",
      [request.params.id, visibleAudiences(actor)]
    );
    if (!visible.rows[0]) return reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });
    await db.query(
      "INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [request.params.id, actor.userId]
    );
    return reply.code(204).send();
  });

  app.post<{ Params: IdParams }>("/api/v1/admin/announcements/:id/archive", {
    schema: { params: idParams },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const archived = await transactionalDb.transaction(async (tx) => {
      const updated = await tx.query(
        "UPDATE announcements SET archived_at = now() WHERE id=$1 AND archived_at IS NULL RETURNING id",
        [request.params.id]
      );
      if (!updated.rows[0]) return false;
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id) VALUES ($1,'announcement.archived','announcement',$2,$3)",
        [actor.userId, request.params.id, request.id]
      );
      return true;
    });
    if (!archived) return reply.code(404).send({ error: "not_found", message: "The requested resource was not found." });
    return reply.code(204).send();
  });
}
