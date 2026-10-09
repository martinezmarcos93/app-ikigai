import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/security/password.js";

test("password hash verifies the correct password and rejects another", async () => {
  const password = "correct-horse-battery-2026";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("incorrect-password", encoded), false);
});

test("password creation enforces length and verification fails closed for malformed hashes", async () => {
  await assert.rejects(() => hashPassword("short"), /between 12 and 128/);
  assert.equal(await verifyPassword("some-password", "plaintext"), false);
  assert.equal(await verifyPassword("x".repeat(129), "plaintext"), false);
});
