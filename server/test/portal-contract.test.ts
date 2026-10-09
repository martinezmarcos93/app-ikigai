import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

async function readRoot(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("connected portal loads its API client and responsive stylesheet", async () => {
  const html = await readRoot("portal.html");
  assert.match(html, /href="portal\.css"/);
  assert.match(html, /src="api-client\.js"/);
  assert.match(html, /src="portal\.js"/);
  assert.match(html, /id="loginForm"/);
  assert.match(html, /id="portalPanel"/);
});

test("connected portal does not fall back to demo browser storage", async () => {
  const portal = await readRoot("portal.js");
  assert.equal(portal.includes("localStorage.getItem"), false);
  assert.equal(portal.includes("localStorage.setItem"), false);
  assert.equal(portal.includes("sessionStorage.getItem"), false);
  assert.equal(portal.includes("sessionStorage.setItem"), false);
  assert.match(portal, /api\.me\(\)/);
  assert.match(portal, /api\.login\(/);
  assert.match(portal, /api\.logout\(/);
  assert.ok(portal.includes('"create-ledger"'));
  assert.ok(portal.includes('"create-membership"'));
  assert.ok(portal.includes('"invite-member"'));
  assert.match(portal, /async function renderMyRoutine/);
  assert.match(portal, /async function renderAttendance/);
  assert.match(portal, /api\.listRoutineAssignments/);
  assert.match(portal, /api\.listAttendance/);
});

test("API client sends cookies, CSRF tokens, and disables response caching", async () => {
  const client = await readRoot("api-client.js");
  assert.match(client, /credentials: "include"/);
  assert.match(client, /cache: "no-store"/);
  assert.match(client, /X-CSRF-Token/);
  assert.ok(client.includes("/auth/login"));
  assert.ok(client.includes("/auth/me"));
  assert.ok(client.includes("/members/${id(memberId)}/ledger-entries"));
  assert.ok(client.includes("/admin/invitations"));
  assert.match(client, /Por seguridad, la API debe compartir origen/);
});
