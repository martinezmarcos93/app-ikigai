import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("development defaults are local and explicit", () => {
  assert.deepEqual(loadConfig({ NODE_ENV: "development" }), {
    nodeEnv: "development",
    host: "127.0.0.1",
    port: 3001,
    corsOrigins: ["http://localhost:8000", "http://127.0.0.1:8000"]
  });
});

test("production requires explicit CORS origins", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production" }),
    /CORS_ORIGINS must be explicitly configured/
  );
});

test("production accepts exact origins and rejects wildcard/path origins", () => {
  assert.deepEqual(
    loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com" }).corsOrigins,
    ["https://gym.example.com"]
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "*" }),
    /Invalid CORS origin/
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com/app" }),
    /exact HTTP\(S\) origins/
  );
});

test("invalid ports and environments fail during startup", () => {
  assert.throws(() => loadConfig({ PORT: "0" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ PORT: "3.14" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ NODE_ENV: "staging" }), /NODE_ENV must be/);
});
