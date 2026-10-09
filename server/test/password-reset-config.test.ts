import test from "node:test";
import assert from "node:assert/strict";
import { validatePasswordResetConfig } from "../src/security/password-reset-config.js";

const valid = {
  baseUrl: "https://gym.example.com/reset-password",
  apiKey: "re_" + "a".repeat(40),
  from: "Ikigai Training <seguridad@gym.example.com>",
  corsOrigins: ["https://gym.example.com"]
};

test("production password-reset settings accept a valid HTTPS same-origin configuration", () => {
  assert.deepEqual(validatePasswordResetConfig(valid), {
    baseUrl: valid.baseUrl, apiKey: valid.apiKey, from: valid.from
  });
});

test("production password-reset settings require every delivery variable", () => {
  assert.throws(() => validatePasswordResetConfig({ ...valid, apiKey: "" }), /are required in production/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, baseUrl: undefined }), /are required in production/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, from: undefined }), /are required in production/);
});

test("production password-reset settings reject weak keys and unsafe sender headers", () => {
  assert.throws(() => validatePasswordResetConfig({ ...valid, apiKey: "short" }), /at least 32 characters/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, from: "sender@example.com\\r\\nBcc: attacker@example.com" }), /single-line sender/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, from: "x".repeat(255) }), /at most 254 characters/);
});

test("production password-reset URL must be HTTPS, credential-free, and free of query/fragment", () => {
  assert.throws(() => validatePasswordResetConfig({ ...valid, baseUrl: "http://gym.example.com/reset-password" }), /must be HTTPS/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, baseUrl: "https://user:pass@gym.example.com/reset-password" }), /contain no credentials/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, baseUrl: "https://gym.example.com/reset-password?token=x" }), /must not contain a query string or fragment/);
  assert.throws(() => validatePasswordResetConfig({ ...valid, baseUrl: "https://gym.example.com/reset-password#token=x" }), /must not contain a query string or fragment/);
});

test("password-reset public origin must be listed in CORS origins", () => {
  assert.throws(() => validatePasswordResetConfig({ ...valid, corsOrigins: ["https://other.example.com"] }), /origin must be included in CORS_ORIGINS/);
});
