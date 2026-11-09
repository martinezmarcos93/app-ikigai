import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { isAllowedPushEndpoint, type PushSender, type PushTarget } from "../domain/web-push.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

type Audience = "all" | "members" | "coaches";
interface SubscribeBody { endpoint: string; keys: { p256dh: string; auth: string } }
interface RemoveBody { endpoint: string }

const unauthenticated = { error: "unauthenticated", message: "A valid session is required." };
const disabled = { error: "push_disabled", message: "Push notifications are not configured on this server." };

// Quien recibe cada aviso: los mismos que lo ven en el portal (administracion ve todo).
const rolesFor: Record<Audience, string[]> = {
  all: ["admin", "member", "coach"],
  members: ["admin", "member"],
  coaches: ["admin", "coach"]
};

interface SubscriptionRow extends Record<string, unknown> { id: string; endpoint: string; p256dh: string; auth: string }

async function deliver(db: Database, sender: PushSender, log: FastifyBaseLogger, rows: SubscriptionRow[], payload: string) {
  const results = await Promise.allSettled(rows.map(async (row) => {
    const target: PushTarget = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth };
    const { status } = await sender(target, payload);
    if (status === 404 || status === 410) await db.query("DELETE FROM push_subscriptions WHERE id=$1", [row.id]);
    else if (status >= 200 && status < 300) await db.query("UPDATE push_subscriptions SET last_success_at=now() WHERE id=$1", [row.id]);
    else log.warn({ status, subscriptionId: row.id }, "push: el servicio de push rechazo el envio");
    return status;
  }));
  const failed = results.filter((r) => r.status === "rejected");
  for (const r of failed) log.error({ err: (r as PromiseRejectedResult).reason }, "push: fallo un envio");
  return { sent: results.length - failed.length, failed: failed.length };
}

/** Avisa por push a los dispositivos de quienes deben ver el aviso (sin el autor). Nunca lanza: loguea. */
export async function notifyAnnouncement(
  db: Database, sender: PushSender | undefined, log: FastifyBaseLogger,
  announcement: { id: string; title: string; body: string; audience: Audience; createdBy: string }
): Promise<void> {
  if (!sender) return;
  try {
    const rows = await db.query<SubscriptionRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
        WHERE u.status = 'active' AND ps.user_id <> $1
          AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.revoked_at IS NULL AND r.role = ANY($2::text[]))`,
      [announcement.createdBy, rolesFor[announcement.audience]]
    );
    const body = announcement.body.length > 180 ? `${announcement.body.slice(0, 177)}...` : announcement.body;
    const payload = JSON.stringify({ kind: "announcement", id: announcement.id, title: announcement.title, body, url: "/portal.html#announcements" });
    const outcome = await deliver(db, sender, log, rows.rows, payload);
    log.info({ announcementId: announcement.id, devices: rows.rows.length, ...outcome }, "push: aviso enviado");
  } catch (error) {
    log.error({ err: error, announcementId: announcement.id }, "push: no se pudo notificar el aviso");
  }
}

export function registerPushRoutes(app: FastifyInstance, db: Database, config: AppConfig, sender: PushSender | undefined): void {
  app.get("/api/v1/push/config", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    return reply.send({ enabled: Boolean(sender && config.vapid), publicKey: config.vapid?.publicKey ?? null });
  });

  app.post<{ Body: SubscribeBody }>("/api/v1/push/subscriptions", {
    schema: {
      body: {
        type: "object", required: ["endpoint", "keys"], additionalProperties: false,
        properties: {
          endpoint: { type: "string", minLength: 1, maxLength: 1000 },
          keys: {
            type: "object", required: ["p256dh", "auth"], additionalProperties: false,
            properties: {
              p256dh: { type: "string", pattern: "^[A-Za-z0-9_-]{80,100}$" },
              auth: { type: "string", pattern: "^[A-Za-z0-9_-]{16,30}$" }
            }
          }
        }
      }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    if (!sender || !config.vapid) return reply.code(409).send(disabled);
    if (!isAllowedPushEndpoint(request.body.endpoint)) {
      return reply.code(400).send({ error: "invalid_push_endpoint", message: "The push endpoint is not from a known push service." });
    }
    // Un mismo dispositivo puede pasar a otra persona (otro login): la suscripcion queda con quien la registro ultimo.
    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [actor.userId, request.body.endpoint, request.body.keys.p256dh, request.body.keys.auth]
    );
    return reply.code(204).send();
  });

  app.post<{ Body: RemoveBody }>("/api/v1/push/subscriptions/remove", {
    schema: {
      body: { type: "object", required: ["endpoint"], additionalProperties: false, properties: { endpoint: { type: "string", minLength: 1, maxLength: 1000 } } }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    await db.query("DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2", [request.body.endpoint, actor.userId]);
    return reply.code(204).send();
  });

  // Prueba: manda una notificacion a los dispositivos de la propia persona, para verificar que llega.
  app.post("/api/v1/push/test", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    if (!sender || !config.vapid) return reply.code(409).send(disabled);
    const rows = await db.query<SubscriptionRow>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1", [actor.userId]);
    const payload = JSON.stringify({ kind: "test", title: "Ikigai Training", body: "Las notificaciones de avisos funcionan en este dispositivo.", url: "/portal.html#announcements" });
    const outcome = await deliver(db, sender, request.log, rows.rows, payload);
    return reply.send({ devices: rows.rows.length, ...outcome });
  });
}
