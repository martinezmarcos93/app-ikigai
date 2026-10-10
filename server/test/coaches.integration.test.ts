import test from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./setup.js"; // Suponiendo este helper

test("coaches API access control", async (t) => {
  const env = await setupTestEnv();
  const { fastify } = env;

  await t.test("only admins can list coaches", async () => {
    // 1. Crear usuario member
    const member = await env.createUser({ roles: ["member"] });
    const memberSession = await env.createSession(member.id);

    // 2. Intentar listar coaches como member (debería fallar)
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/coaches",
      headers: { cookie: `session=${memberSession.token}` }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.payload).error, "forbidden");
  });

  await t.test("admins can list coaches", async () => {
    // 1. Crear usuario admin
    const admin = await env.createUser({ roles: ["admin"] });
    const adminSession = await env.createSession(admin.id);

    // 2. Listar coaches como admin (debería funcionar)
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/coaches",
      headers: { cookie: `session=${adminSession.token}` }
    });

    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(JSON.parse(response.payload).coaches));
  });
});
