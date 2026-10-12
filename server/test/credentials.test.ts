import assert from "node:assert/strict";
import { test } from "node:test";
import { generateTemporaryPassword, initials, usernameCandidates } from "../src/domain/credentials.js";

test("el usuario sale del rol y del nombre, sin tildes ni espacios", () => {
  assert.equal(usernameCandidates("member", "Marcos Martínez")[0], "ikigai-miembro-marcos");
  assert.equal(usernameCandidates("coach", "Florencia Ejemplo")[0], "ikigai-profesor-florencia");
  assert.equal(usernameCandidates("member", "  María José  Ñandú ")[0], "ikigai-miembro-maria");
});

test("ante un homonimo se prueba con el apellido y luego con un numero", () => {
  const lista = usernameCandidates("member", "Marcos Martinez", 3);
  assert.deepEqual(lista, [
    "ikigai-miembro-marcos",
    "ikigai-miembro-marcos-martinez",
    "ikigai-miembro-marcos-martinez-2",
    "ikigai-miembro-marcos-martinez-3",
    "ikigai-miembro-marcos-martinez-4"
  ]);
  assert.deepEqual(usernameCandidates("coach", "Cher", 1), ["ikigai-profesor-cher", "ikigai-profesor-cher-2"]);
});

test("todo candidato cumple el formato de la base", () => {
  for (const nombre of ["Ana", "O'Connor Smith-Jones", "李 雷 Li", "A".repeat(200) + " " + "B".repeat(200)]) {
    for (const c of (() => { try { return usernameCandidates("member", nombre); } catch { return []; } })()) {
      assert.match(c, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.ok(c.length >= 3 && c.length <= 64, c);
    }
  }
  assert.throws(() => usernameCandidates("member", "!!! ???"));
});

test("iniciales: primer y ultimo nombre", () => {
  assert.equal(initials("Marcos Martinez"), "MM");
  assert.equal(initials("Ana María de la Fuente"), "AF");
  assert.equal(initials("Cher"), "CH");
});

test("la clave temporal tiene el formato acordado, es larga y no se repite", () => {
  const vistas = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const clave = generateTemporaryPassword("Marcos Martinez");
    assert.match(clave, /^MM-Ikigai-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    assert.ok(clave.length >= 12 && clave.length <= 128);
    vistas.add(clave);
  }
  assert.equal(vistas.size, 500);
});
