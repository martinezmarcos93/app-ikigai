import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://catalog-integration.example.com";
const config = loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: "integration-test-secret-with-more-than-32-characters" });

type Role = "admin" | "member" | "coach";
async function createActor(pool: pg.Pool, name: string, role: Role) {
  const user = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,'integration-test-placeholder-hash','local','active') RETURNING id",
    [`catalog-it-${randomUUID()}@example.test`]
  );
  const userId = String(user.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  let memberId: string | null = null;
  if (role === "member") memberId = String((await pool.query("INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id", [userId, name])).rows[0]?.id);
  if (role === "coach") await pool.query("INSERT INTO coach_profiles (user_id,full_name,discipline) VALUES ($1,$2,'Funcional')", [userId, name]);
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)", [
    userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString()
  ]);
  return { userId, memberId, token, csrfToken: csrfTokenFor(token, config.sessionSecret) };
}
const headers = (a: { token: string; csrfToken: string }) => ({ origin, cookie: `ikigai_session=${a.token}`, "x-csrf-token": a.csrfToken });

test("PostgreSQL catalog: admin manages products, members reserve, admin delivers", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5_000 });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => { await app.close(); await pool.end(); });

  const suffix = randomUUID().slice(0, 8);
  const admin = await createActor(pool, `Admin ${suffix}`, "admin");
  const coach = await createActor(pool, `Profe ${suffix}`, "coach");
  const ana = await createActor(pool, `Ana ${suffix}`, "member");
  const beto = await createActor(pool, `Beto ${suffix}`, "member");

  // Solo administración carga productos.
  const byCoach = await app.inject({ method: "POST", url: "/api/v1/admin/products", headers: headers(coach), payload: { name: "X", category: "Y" } });
  assert.equal(byCoach.statusCode, 403);
  const whey = await app.inject({
    method: "POST", url: "/api/v1/admin/products", headers: headers(admin),
    payload: { name: `Proteína ${suffix}`, category: "Proteínas", description: "1 kg, sabor chocolate", price: 32000.555 }
  });
  assert.equal(whey.statusCode, 201, whey.body);
  const wheyId = String(whey.json().product.id);
  assert.equal(Number(whey.json().product.price), 32000.56);
  const bar = await app.inject({ method: "POST", url: "/api/v1/admin/products", headers: headers(admin), payload: { name: `Barrita ${suffix}`, category: "Barras" } });
  assert.equal(bar.statusCode, 201);
  assert.equal(bar.json().product.price, null, "sin precio = consultar");
  const barId = String(bar.json().product.id);

  // El profe ve el catálogo pero no reserva.
  const coachList = await app.inject({ method: "GET", url: "/api/v1/products", headers: headers(coach) });
  assert.equal(coachList.statusCode, 200);
  assert.equal(coachList.json().canReserve, false);
  const coachReserve = await app.inject({ method: "POST", url: `/api/v1/products/${wheyId}/reservations`, headers: headers(coach), payload: { quantity: 1 } });
  assert.equal(coachReserve.statusCode, 403);

  // Ana reserva; el precio queda anotado aunque después cambie.
  const reserved = await app.inject({ method: "POST", url: `/api/v1/products/${wheyId}/reservations`, headers: headers(ana), payload: { quantity: 2, note: "La retiro el jueves" } });
  assert.equal(reserved.statusCode, 201, reserved.body);
  const reservationId = String(reserved.json().reservation.id);
  const repriced = await app.inject({ method: "PATCH", url: `/api/v1/admin/products/${wheyId}`, headers: headers(admin), payload: { price: 35000 } });
  assert.equal(repriced.statusCode, 200);
  assert.equal(repriced.json().product.name, `Proteína ${suffix}`, "PATCH no toca lo que no vino");

  // Sin stock no se reserva; dado de baja no se ve.
  await app.inject({ method: "PATCH", url: `/api/v1/admin/products/${barId}`, headers: headers(admin), payload: { available: false } });
  const outOfStock = await app.inject({ method: "POST", url: `/api/v1/products/${barId}/reservations`, headers: headers(ana), payload: { quantity: 1 } });
  assert.equal(outOfStock.statusCode, 409);
  assert.equal(outOfStock.json().error, "product_unavailable");
  await app.inject({ method: "PATCH", url: `/api/v1/admin/products/${barId}`, headers: headers(admin), payload: { active: false } });
  const memberList = await app.inject({ method: "GET", url: "/api/v1/products", headers: headers(ana) });
  assert.ok(!memberList.json().products.some((p: { id: string }) => p.id === barId), "producto dado de baja oculto para miembros");
  const adminList = await app.inject({ method: "GET", url: "/api/v1/products", headers: headers(admin) });
  assert.ok(adminList.json().products.some((p: { id: string }) => p.id === barId), "administración lo sigue viendo");

  // Beto no ve ni cancela la reserva de Ana.
  const betoList = await app.inject({ method: "GET", url: "/api/v1/reservations", headers: headers(beto) });
  assert.equal(betoList.json().pending.length, 0);
  const betoCancel = await app.inject({ method: "POST", url: `/api/v1/reservations/${reservationId}/cancel`, headers: headers(beto) });
  assert.equal(betoCancel.statusCode, 404);
  const anaList = await app.inject({ method: "GET", url: "/api/v1/reservations", headers: headers(ana) });
  assert.equal(anaList.json().pending.length, 1);
  assert.equal(Number(anaList.json().pending[0].unit_price_snapshot), 32000.56);

  // Administración entrega; ya no se puede cancelar.
  const memberDeliver = await app.inject({ method: "POST", url: `/api/v1/admin/reservations/${reservationId}/deliver`, headers: headers(ana) });
  assert.equal(memberDeliver.statusCode, 403);
  const delivered = await app.inject({ method: "POST", url: `/api/v1/admin/reservations/${reservationId}/deliver`, headers: headers(admin) });
  assert.equal(delivered.statusCode, 200, delivered.body);
  const lateCancel = await app.inject({ method: "POST", url: `/api/v1/reservations/${reservationId}/cancel`, headers: headers(ana) });
  assert.equal(lateCancel.statusCode, 409);

  // Tope de reservas pendientes por miembro; el miembro cancela las suyas.
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await app.inject({ method: "POST", url: `/api/v1/products/${wheyId}/reservations`, headers: headers(beto), payload: { quantity: 1 } });
    assert.equal(r.statusCode, 201);
    ids.push(String(r.json().reservation.id));
  }
  const sixth = await app.inject({ method: "POST", url: `/api/v1/products/${wheyId}/reservations`, headers: headers(beto), payload: { quantity: 1 } });
  assert.equal(sixth.statusCode, 409);
  assert.equal(sixth.json().error, "too_many_reservations");
  const cancelled = await app.inject({ method: "POST", url: `/api/v1/reservations/${ids[0]}/cancel`, headers: headers(beto) });
  assert.equal(cancelled.statusCode, 200);

  const overview = await app.inject({ method: "GET", url: "/api/v1/reservations", headers: headers(admin) });
  assert.ok(overview.json().pending.filter((r: { member_name: string }) => r.member_name === `Beto ${suffix}`).length === 4);
  const audit = await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_type IN ('product','product_reservation') AND actor_user_id IN ($1,$2)", [admin.userId, beto.userId]);
  assert.ok(Number(audit.rows[0]?.n) >= 6);
});
