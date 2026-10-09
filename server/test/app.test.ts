import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

test("health endpoints expose status only and include security headers", async (t) => {
  const app = await buildApp(loadConfig({ NODE_ENV: "test" }));
  t.after(() => app.close());

  const root = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(root.statusCode, 200);
  assert.deepEqual(root.json(), { status: "ok" });
  assert.equal(root.headers["x-content-type-options"], "nosniff");

  const versioned = await app.inject({ method: "GET", url: "/api/v1/health" });
  assert.equal(versioned.statusCode, 200);
  assert.equal(versioned.headers["cache-control"], "no-store");
  assert.equal(versioned.headers.pragma, "no-cache");
  assert.deepEqual(versioned.json(), {
    status: "ok", service: "ikigai-api", version: "v1"
  });
});

test("unknown endpoints return a stable non-sensitive error", async (t) => {
  const app = await buildApp(loadConfig({ NODE_ENV: "test" }));
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v1/not-real" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), {
    error: "not_found", message: "The requested resource was not found."
  });
});

test("CORS allows configured origins and blocks unconfigured origins", async (t) => {
  const app = await buildApp(loadConfig({
    NODE_ENV: "test",
    CORS_ORIGINS: "https://allowed.example.com"
  }));
  t.after(() => app.close());

  const allowed = await app.inject({
    method: "GET", url: "/api/v1/health",
    headers: { origin: "https://allowed.example.com" }
  });
  assert.equal(allowed.headers["access-control-allow-origin"], "https://allowed.example.com");

  const blocked = await app.inject({
    method: "GET", url: "/api/v1/health",
    headers: { origin: "https://untrusted.example.com" }
  });
  assert.notEqual(blocked.headers["access-control-allow-origin"], "https://untrusted.example.com");
});

test("production mode emits transport and browser security headers", async (t) => {
  const app = await buildApp(loadConfig({
    NODE_ENV: "production",
    CORS_ORIGINS: "https://gym.example.com",
    SESSION_SECRET: "production-test-session-secret-with-more-than-32-characters",
    PASSWORD_RESET_BASE_URL: "https://gym.example.com/reset-password"
  }));
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
    headers: { origin: "https://gym.example.com" }
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-security-policy"]), /default-src/);
  assert.match(String(response.headers["strict-transport-security"]), /max-age=/);
  assert.equal(response.headers["cache-control"], "no-store");
});
