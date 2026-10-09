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
  assert.doesNotMatch(portal, /localStorage|sessionStorage/);
  assert.match(portal, /api\.me\(\)/);
  assert.match(portal, /api\.login\(/);
  assert.match(portal, /api\.logout\(/);
  assert.match(portal, /data-form="create-ledger"/);
  assert.match(portal, /data-form="create-membership"/);
  assert.match(portal, /data-form="invite-member"/);
});

test("API client sends cookies, CSRF tokens, and disables response caching", async () => {
  const client = await readRoot("api-client.js");
  assert.match(client, /credentials: "include"/);
  assert.match(client, /cache: "no-store"/);
  assert.match(client, /X-CSRF-Token/);
  assert.match(client, //auth\/login/);
  assert.match(client, //auth\/me/);
  assert.match(client, //members\/\$\{id\(memberId\)\}\/ledger-entries/);
  assert.match(client, //admin\/invitations/);
  assert.match(client, /Por seguridad, la API debe compartir origen/);
});
