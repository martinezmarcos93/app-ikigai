import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("institution settings are server-backed, admin-only, no-store, and audited", async () => {
  const [route, migration, app] = await Promise.all([
    readFile(new URL("../src/routes/institutional-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0005_institutional_settings.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app.ts", import.meta.url), "utf8")
  ]);
  assert.match(route, /\/api\/v1\/admin\/institution-settings/);
  assert.match(route, /actor\.roles\.includes\("admin"\)/);
  assert.match(route, /requireCsrf\(request, reply, actor\.sessionToken, config\)/);
  assert.match(route, /Cache-Control", "no-store"/);
  assert.match(route, /transactionalDb\.transaction/);
  assert.match(route, /institution\.settings_updated/);
  assert.match(route, /changedFields/);
  assert.match(migration, /CREATE TABLE institutional_settings/);
  assert.match(migration, /INSERT INTO institutional_settings \(id\) VALUES \(1\)/);
  assert.doesNotMatch(migration, /INSERT INTO institutional_settings[^;]*(?:Ikigai|Agust[ií]n|example\.com)/i);
  assert.match(app, /registerInstitutionalSettingsRoutes/);
});

test("institution settings portal contract uses API methods and does not use localStorage", async () => {
  const [client, portal, html] = await Promise.all([
    readFile(new URL("../../api-client.js", import.meta.url), "utf8"),
    readFile(new URL("../../portal.js", import.meta.url), "utf8"),
    readFile(new URL("../../portal.html", import.meta.url), "utf8")
  ]);
  assert.match(client, /getInstitutionSettings/);
  assert.match(client, /updateInstitutionSettings/);
  assert.match(portal, /renderInstitutionSettings/);
  assert.match(portal, /form\("Configuración institucional","institution-settings"/);
  // Se prohibe USAR el almacenamiento local (acceso por punto o corchetes), no mencionarlo en un texto.
  assert.doesNotMatch(portal, /\blocalStorage\s*(\.|\[)/);
  assert.match(html, /data-view="institution-settings"/);
});
