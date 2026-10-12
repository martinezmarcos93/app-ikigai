import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { isWeakPassword } from "../src/security/password.js";
import { networkIdentity } from "../src/security/throttle.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://hardening.example.test";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "hardening-integration-secret-with-more-than-32-characters",
  TRUST_PROXY_HOPS: "1"
});

test("las direcciones IPv6 se agrupan por /64 y las IPv4 quedan tal cual", () => {
  assert.equal(networkIdentity("203.0.113.9"), "203.0.113.9");
  assert.equal(networkIdentity("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(networkIdentity("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), networkIdentity("2001:0db8:0001:0002:1111:2222:3333:4444"));
  assert.notEqual(networkIdentity("2001:db8:1:2::1"), networkIdentity("2001:db8:1:3::1"));
  assert.equal(networkIdentity("2001:db8::1"), "2001:db8:0:0::/64");
});

test("claves obvias se rechazan y las razonables no", () => {
  for (const weak of ["aaaaaaaaaaaa", "abababababab", "123456789012", "Password1234", "ikigai-training", "012345678901"]) {
    assert.equal(isWeakPassword(weak), true, weak);
  }
  assert.equal(isWeakPassword("ikigai.marcos@example.test", "marcos", "ikigai.marcos@example.test"), true);
  for (const fine of ["MM-Ikigai-K7Q4-9XMP", "clave-e2e-segura-2026", "Correcta Caballo Bateria Grapa"]) {
    assert.equal(isWeakPassword(fine), false, fine);
  }
});

test("topes por cuenta, rutas codificadas, token inexistente y origen ajeno", { skip: !integrationEnabled }, async (t: TestContext) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5_000, application_name: "ikigai-hardening-test" });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  const login = `cuenta-hardening-${Date.now()}`;
  const accountKey = createHmac("sha256", config.sessionSecret).update(`login-account:${login}`).digest("hex");
  const encodedKey = createHmac("sha256", config.sessionSecret).update("POST:/api/v1/auth/login:198.51.100.200").digest("hex");
  t.after(async () => {
    await pool.query("DELETE FROM rate_limit_buckets WHERE bucket_key = ANY($1)", [[accountKey, encodedKey]]);
    await app.close();
    await pool.end();
  });
  await pool.query("DELETE FROM rate_limit_buckets WHERE bucket_key = ANY($1)", [[accountKey, encodedKey]]);

  // Tope por cuenta: 10 fallos desde direcciones distintas y el siguiente intento se bloquea, exista o no la cuenta.
  for (let i = 0; i < 10; i += 1) {
    const response = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      headers: { origin, "x-forwarded-for": `198.51.100.${i + 1}` },
      payload: { login, password: "clave-incorrecta-de-prueba" }
    });
    assert.equal(response.statusCode, 401, `intento ${i + 1}`);
  }
  const blocked = await app.inject({
    method: "POST", url: "/api/v1/auth/login",
    headers: { origin, "x-forwarded-for": "198.51.100.150" },
    payload: { login, password: "clave-incorrecta-de-prueba" }
  });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error, "too_many_attempts");
  assert.ok(Number(blocked.headers["retry-after"]) > 0);

  // La ruta con %xx llega al mismo handler: el limitador compartido tiene que contarla igual.
  const encoded = await app.inject({
    method: "POST", url: "/api/v1/auth/%6cogin",
    headers: { origin, "x-forwarded-for": "198.51.100.200" },
    payload: { login: `otro-${login}`, password: "clave-incorrecta-de-prueba" }
  });
  assert.equal(encoded.statusCode, 401);
  const counted = await pool.query("SELECT request_count FROM rate_limit_buckets WHERE bucket_key = $1", [encodedKey]);
  assert.equal(counted.rows[0]?.request_count, 1);
  await pool.query("DELETE FROM rate_limit_buckets WHERE bucket_key = $1", [`${createHmac("sha256", config.sessionSecret).update(`login-account:otro-${login}`).digest("hex")}`]);

  // Un token inexistente se rechaza sin pagar el scrypt (~0,3 s con 64 MiB): la respuesta es inmediata.
  const started = Date.now();
  const reset = await app.inject({
    method: "POST", url: "/api/v1/auth/password-reset/confirm",
    headers: { origin, "x-forwarded-for": "198.51.100.201" },
    payload: { token: "A".repeat(43), password: "una-clave-nueva-y-larga-2026" }
  });
  assert.equal(reset.statusCode, 400);
  assert.ok(Date.now() - started < 150, `tardo ${Date.now() - started} ms: se hizo el scrypt antes de validar el token`);

  const invitation = await app.inject({
    method: "POST", url: "/api/v1/auth/accept-invitation",
    headers: { origin, "x-forwarded-for": "198.51.100.202" },
    payload: { token: "B".repeat(43), password: "una-clave-nueva-y-larga-2026" }
  });
  assert.equal(invitation.statusCode, 400);

  // Origen no permitido: nunca un 500.
  const cors = await app.inject({ method: "OPTIONS", url: "/api/v1/auth/login", headers: { origin: "https://atacante.example.test", "access-control-request-method": "POST" } });
  assert.ok(cors.statusCode < 500, `status ${cors.statusCode}`);
  assert.equal(cors.headers["access-control-allow-origin"], undefined);
});
