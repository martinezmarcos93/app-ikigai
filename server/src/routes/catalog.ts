import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

// Catálogo del gimnasio: administración carga los productos; los miembros reservan y retiran/pagan en el mostrador.
export const MAX_PENDING_RESERVATIONS = 5;

interface ProductBody {
  name?: string;
  category?: string;
  description?: string | null;
  price?: number | null;
  available?: boolean;
  active?: boolean;
}
interface ReservationBody { quantity: number; note?: string }

class CatalogError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "CatalogError";
  }
}
function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof CatalogError) return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "23514" || code === "23502") return reply.code(400).send({ error: "invalid_product", message: "One or more fields violate a data constraint." });
  throw error;
}

const unauthenticated = { error: "unauthenticated", message: "A valid session is required." };
const forbidden = { error: "forbidden", message: "Administrator permission is required." };
const notFound = { error: "not_found", message: "The requested resource was not found." };
const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;
const productProperties = {
  name: { type: "string", minLength: 1, maxLength: 120 },
  category: { type: "string", minLength: 1, maxLength: 60 },
  description: { type: ["string", "null"], maxLength: 1000 },
  price: { type: ["number", "null"], minimum: 0, maximum: 9999999999 },
  available: { type: "boolean" },
  active: { type: "boolean" }
} as const;
const PRODUCT_COLUMNS = "id, name, category, description, price, available, active, updated_at";
const clean = (value: string | null | undefined) => (typeof value === "string" ? value.trim() || null : value ?? null);
const roundPrice = (value: number | null | undefined) => (typeof value === "number" ? Math.round(value * 100) / 100 : value ?? null);

export function registerCatalogRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  // Todos ven el catálogo activo; administración ve también lo dado de baja.
  app.get("/api/v1/products", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    const isAdmin = actor.roles.includes("admin");
    const result = await db.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products ${isAdmin ? "" : "WHERE active"} ORDER BY active DESC, lower(category), lower(name), id`
    );
    return reply.send({ products: result.rows, canReserve: Boolean(actor.memberId && actor.roles.includes("member")) });
  });

  app.post<{ Body: ProductBody }>("/api/v1/admin/products", {
    schema: { body: { type: "object", required: ["name", "category"], additionalProperties: false, properties: productProperties } },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const b = request.body;
    const name = clean(b.name);
    const category = clean(b.category);
    if (!name || !category) return reply.code(400).send({ error: "invalid_product", message: "Name and category cannot be empty." });
    try {
      const product = await transactionalDb.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO products (name, category, description, price, available, active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PRODUCT_COLUMNS}`,
          [name, category, clean(b.description), roundPrice(b.price), b.available ?? true, b.active ?? true, actor.userId]
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Product insert did not return a row.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'product.created','product',$2,$3,$4::jsonb)",
          [actor.userId, row.id, request.id, JSON.stringify({ name, category, price: row.price })]
        );
        return row;
      });
      return reply.code(201).send({ product });
    } catch (error) { return sendError(reply, error); }
  });

  app.patch<{ Params: { id: string }; Body: ProductBody }>("/api/v1/admin/products/:id", {
    schema: { params: idParams, body: { type: "object", additionalProperties: false, minProperties: 1, properties: productProperties } },
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const b = request.body;
    if ((b.name !== undefined && !clean(b.name)) || (b.category !== undefined && !clean(b.category))) {
      return reply.code(400).send({ error: "invalid_product", message: "Name and category cannot be empty." });
    }
    // Solo se tocan las columnas que vinieron en el pedido (description y price aceptan null para borrarlos).
    const sets: string[] = [];
    const values: unknown[] = [request.params.id];
    const put = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
    if (b.name !== undefined) put("name", clean(b.name));
    if (b.category !== undefined) put("category", clean(b.category));
    if (b.description !== undefined) put("description", clean(b.description));
    if (b.price !== undefined) put("price", roundPrice(b.price));
    if (b.available !== undefined) put("available", b.available);
    if (b.active !== undefined) put("active", b.active);
    try {
      const product = await transactionalDb.transaction(async (tx) => {
        const before = await tx.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 FOR UPDATE`, [request.params.id]);
        if (!before.rows[0]) throw new CatalogError(404, "not_found", notFound.message);
        const updated = await tx.query(`UPDATE products SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING ${PRODUCT_COLUMNS}`, values);
        const row = updated.rows[0];
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'product.updated','product',$2,$3,$4::jsonb,$5::jsonb)",
          [actor.userId, request.params.id, request.id, JSON.stringify(before.rows[0]), JSON.stringify(row)]
        );
        return row;
      });
      return reply.send({ product });
    } catch (error) { return sendError(reply, error); }
  });

  // El miembro reserva; el precio queda anotado como referencia.
  app.post<{ Params: { id: string }; Body: ReservationBody }>("/api/v1/products/:id/reservations", {
    schema: {
      params: idParams,
      body: {
        type: "object", required: ["quantity"], additionalProperties: false,
        properties: { quantity: { type: "integer", minimum: 1, maximum: 10 }, note: { type: "string", maxLength: 200 } }
      }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.memberId || !actor.roles.includes("member")) {
      return reply.code(403).send({ error: "forbidden", message: "Only members can reserve products." });
    }
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const memberId = actor.memberId;
    try {
      const reservation = await transactionalDb.transaction(async (tx) => {
        await tx.query("SELECT id FROM member_profiles WHERE id = $1 FOR UPDATE", [memberId]);
        const product = await tx.query("SELECT id, name, price, available, active FROM products WHERE id = $1", [request.params.id]);
        const p = product.rows[0];
        if (!p || p.active !== true) throw new CatalogError(404, "not_found", notFound.message);
        if (p.available !== true) throw new CatalogError(409, "product_unavailable", "The product is out of stock.");
        const pending = await tx.query("SELECT count(*)::int AS n FROM product_reservations WHERE member_id = $1 AND status = 'pending'", [memberId]);
        if (Number(pending.rows[0]?.n ?? 0) >= MAX_PENDING_RESERVATIONS) {
          throw new CatalogError(409, "too_many_reservations", "You already have the maximum number of pending reservations.");
        }
        const inserted = await tx.query(
          `INSERT INTO product_reservations (product_id, member_id, quantity, note, unit_price_snapshot)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, product_id, quantity, note, unit_price_snapshot, status, created_at`,
          [p.id, memberId, request.body.quantity, clean(request.body.note), p.price]
        );
        return { ...inserted.rows[0], product_name: p.name };
      });
      return reply.code(201).send({ reservation });
    } catch (error) { return sendError(reply, error); }
  });

  // Miembro: sus reservas. Administración: pendientes de todos + las últimas resueltas.
  app.get("/api/v1/reservations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    const base = `SELECT r.id, r.quantity, r.note, r.unit_price_snapshot, r.status, r.created_at, r.handled_at,
                         p.id AS product_id, p.name AS product_name, mp.full_name AS member_name
                    FROM product_reservations r JOIN products p ON p.id = r.product_id JOIN member_profiles mp ON mp.id = r.member_id`;
    if (actor.roles.includes("admin")) {
      const [pending, recent] = await Promise.all([
        db.query(`${base} WHERE r.status = 'pending' ORDER BY r.created_at, r.id LIMIT 200`),
        db.query(`${base} WHERE r.status <> 'pending' ORDER BY r.handled_at DESC, r.id LIMIT 30`)
      ]);
      return reply.send({ pending: pending.rows, recent: recent.rows });
    }
    if (!actor.memberId || !actor.roles.includes("member")) return reply.send({ pending: [], recent: [] });
    const [pending, recent] = await Promise.all([
      db.query(`${base} WHERE r.member_id = $1 AND r.status = 'pending' ORDER BY r.created_at, r.id`, [actor.memberId]),
      db.query(`${base} WHERE r.member_id = $1 AND r.status <> 'pending' ORDER BY r.handled_at DESC, r.id LIMIT 20`, [actor.memberId])
    ]);
    return reply.send({ pending: pending.rows, recent: recent.rows });
  });

  async function closeReservation(
    reservationId: string, actorUserId: string, requestId: string, next: "delivered" | "cancelled", ownerMemberId: string | null
  ) {
    return transactionalDb.transaction(async (tx) => {
      const found = await tx.query("SELECT id, member_id, status FROM product_reservations WHERE id = $1 FOR UPDATE", [reservationId]);
      const r = found.rows[0];
      // Un miembro no puede ni saber si existe una reserva ajena.
      if (!r || (ownerMemberId && r.member_id !== ownerMemberId)) throw new CatalogError(404, "not_found", notFound.message);
      if (r.status !== "pending") throw new CatalogError(409, "reservation_closed", "The reservation was already closed.");
      await tx.query("UPDATE product_reservations SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1", [reservationId, next, actorUserId]);
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id) VALUES ($1,$2,'product_reservation',$3,$4)",
        [actorUserId, `product_reservation.${next}`, reservationId, requestId]
      );
      return { id: reservationId, status: next };
    });
  }

  app.post<{ Params: { id: string } }>("/api/v1/reservations/:id/cancel", {
    schema: { params: idParams }, config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const isAdmin = actor.roles.includes("admin");
    if (!isAdmin && !actor.memberId) return reply.code(404).send(notFound);
    try {
      return reply.send({ reservation: await closeReservation(request.params.id, actor.userId, request.id, "cancelled", isAdmin ? null : actor.memberId) });
    } catch (error) { return sendError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin/reservations/:id/deliver", {
    schema: { params: idParams }, config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      return reply.send({ reservation: await closeReservation(request.params.id, actor.userId, request.id, "delivered", null) });
    } catch (error) { return sendError(reply, error); }
  });
}
