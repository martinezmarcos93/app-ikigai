import test from "node:test";
import assert from "node:assert/strict";
import { opaqueRateLimitKey } from "../src/security/rate-limit.js";

test("rate-limit identifiers are deterministic and do not expose the input", () => {
  const email = "Person@example.test";
  const key = opaqueRateLimitKey("login-email", email, "test-secret-with-adequate-entropy");
  assert.equal(key, opaqueRateLimitKey("login-email", " person@example.test ", "test-secret-with-adequate-entropy"));
  assert.equal(key.includes(email), false);
  assert.equal(key.includes("person@example.test"), false);
  assert.match(key, /^login-email:[a-f0-9]{64}$/);
});

test("rate-limit identifiers are isolated by namespace and secret", () => {
  const value = "203.0.113.12";
  const key = opaqueRateLimitKey("login-ip", value, "secret-one");
  assert.notEqual(key, opaqueRateLimitKey("reset-ip", value, "secret-one"));
  assert.notEqual(key, opaqueRateLimitKey("login-ip", value, "secret-two"));
});
