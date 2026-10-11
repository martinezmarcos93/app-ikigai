import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_PARAMETERS, hashPassword, needsRehash, verifyPassword } from "../src/security/password.js";

const LEGACY = { N: 16_384, r: 8, p: 1 };

test("password hash verifies the correct password and rejects another", async () => {
  const password = "correct-horse-battery-2026";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$65536\$8\$2\$/);
  assert.deepEqual(CURRENT_PARAMETERS, { N: 65_536, r: 8, p: 2 });
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("incorrect-password", encoded), false);
});

test("two hashes of the same password differ (random salt)", async () => {
  const password = "correct-horse-battery-2026";
  assert.notEqual(await hashPassword(password, LEGACY), await hashPassword(password, LEGACY));
});

test("password creation enforces length and verification fails closed for malformed hashes", async () => {
  await assert.rejects(() => hashPassword("short"), /between 12 and 128/);
  assert.equal(await verifyPassword("some-password", "plaintext"), false);
  assert.equal(await verifyPassword("x".repeat(129), "plaintext"), false);
});

test("hashes created with the previous, cheaper parameters still verify and are flagged for an upgrade", async () => {
  const password = "correct-horse-battery-2026";
  const legacy = await hashPassword(password, LEGACY);
  assert.match(legacy, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(await verifyPassword("incorrect-password", legacy), false);
  assert.equal(needsRehash(legacy), true);
  assert.equal(needsRehash(await hashPassword(password)), false);
});

test("a hash with unknown or hostile parameters is rejected without deriving a key", async () => {
  const salt = "A".repeat(22);
  const key = "B".repeat(86);
  const started = Date.now();
  for (const encoded of [
    `scrypt$1073741824$8$1$${salt}$${key}`,   // N enorme: agotaria la memoria
    `scrypt$65536$1024$1$${salt}$${key}`,     // r distinto de 8
    `scrypt$65536$8$999$${salt}$${key}`,      // p fuera de la lista
    `scrypt$3$8$1$${salt}$${key}`,            // N que no es potencia valida
    `scrypt$65536$8$2$${salt}$short`,          // clave de largo incorrecto
    `scrypt$65536$8$2$tiny$${key}`              // sal de largo incorrecto
  ]) {
    assert.equal(await verifyPassword("correct-horse-battery-2026", encoded), false, encoded.slice(0, 30));
    assert.equal(needsRehash(encoded), false);
  }
  assert.ok(Date.now() - started < 1_000, "los hashes hostiles no deben costar tiempo de derivacion");
});

test("the current cost stays within a sane time budget", async () => {
  const started = Date.now();
  await hashPassword("correct-horse-battery-2026");
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3_000, `hashear tardo ${elapsed} ms: demasiado para un login`);
});
