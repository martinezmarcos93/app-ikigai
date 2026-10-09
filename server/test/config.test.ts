import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("development defaults are local and explicit", () => {
  assert.deepEqual(loadConfig({ NODE_ENV: "development" }), {
    nodeEnv: "development",
    host: "127.0.0.1",
    port: 3001,
    corsOrigins: ["http://localhost:8000", "http://127.0.0.1:8000"],
    sessionSecret: "development-only-session-secret-change-before-deploy"
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
    loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "test-session-secret-with-more-than-32-characters" }).corsOrigins,
    ["https://gym.example.com"]
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "*", SESSION_SECRET: "test-session-secret-with-more-than-32-characters" }),
    /Invalid CORS origin/
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com/app", SESSION_SECRET: "test-session-secret-with-more-than-32-characters" }),
    /exact HTTP\(S\) origins/
  );
});

test("production requires a strong session secret", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com", SESSION_SECRET: "short" }),
    /SESSION_SECRET must be explicitly configured/
  );
});

test("production cannot use the development session-secret fallback", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://gym.example.com" }),
    /SESSION_SECRET must be explicitly configured/
  );
});

test("invalid ports and environments fail during startup", () => {
  assert.throws(() => loadConfig({ PORT: "0" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ PORT: "3.14" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ NODE_ENV: "staging" }), /NODE_ENV must be/);
});
