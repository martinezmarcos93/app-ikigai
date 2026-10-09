import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("development defaults to a local-only bind address", () => {
  const config = loadConfig({ NODE_ENV: "test", SESSION_PEPPER: "" });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3001);
});

test("production refuses a short session pepper", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://example",
    SESSION_PEPPER: "too-short",
    APP_ORIGIN: "https://ikigai.example",
  }), /at least 32 characters/);
});

test("production refuses a non-HTTPS application origin", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://example",
    SESSION_PEPPER: "a".repeat(40),
    APP_ORIGIN: "http://ikigai.example",
  }), /must use HTTPS/);
});

test("invalid port and session lifetime are rejected", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "test", PORT: "70000" }), /PORT/);
  assert.throws(() => loadConfig({ NODE_ENV: "test", SESSION_TTL_HOURS: "0" }), /SESSION_TTL_HOURS/);
});