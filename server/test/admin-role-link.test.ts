import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin can link a matching coach profile to an existing admin account without creating a duplicate login", async () => {
  const [route, app, migration, portal, client] = await Promise.all([
    readFile(new URL("../src/routes/admin-roles.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0001_initial_schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../../portal.js", import.meta.url), "utf8"),
    readFile(new URL("../../api-client.js", import.meta.url), "utf8")
  ]);
  assert.match(route, /\/api\/v1\/admin\/users\/link-coach/);
  assert.match(route, /roles\.includes\("admin"\)/);
  assert.match(route, /roles\.includes\("coach"\)/);
  assert.match(route, /profileEmail !== email/);
  assert.match(route, /requireCsrf\(request, reply, actor\.sessionToken, config\)/);
  assert.match(route, /user\.coach_role_linked/);
  assert.match(route, /INSERT INTO user_roles/);
  assert.match(route, /UPDATE coach_profiles SET user_id/);
  assert.match(route, /transactionalDb\.transaction/);
  assert.match(app, /registerAdminRoleRoutes/);
  assert.match(migration, /CREATE TABLE user_roles/);
  assert.match(portal, /link-admin-coach/);
  assert.match(client, /linkCoachToAdmin/);
});
