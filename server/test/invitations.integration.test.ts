import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PostgresDatabase } from "../src/db/postgres.js";
import { csrfTokenFor } from "../src/security/csrf.js";
import { verifyPassword } from "../src/security/password.js";

const integrationEnabled = process.env.IKIGAI_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const origin = "https://invitation-integration.example.com";
const config = loadConfig({
  NODE_ENV: "test",
  CORS_ORIGINS: origin,
  SESSION_SECRET: "integration-test-secret-with-more-than-32-characters"
});

async function createActor(pool: pg.Pool, name: string, role: "member" | "admin") {
  const email = `invitation-it-${randomUUID()}@example.test`;
  const inserted = await pool.query(
    "INSERT INTO users (email,password_hash,auth_provider,status) VALUES ($1,$2,'local','active') RETURNING id",
    [email, "integration-test-placeholder-hash"]
  );
  const userId = String(inserted.rows[0]?.id);
  await pool.query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)", [userId, role]);
  const profile = await pool.query(
    "INSERT INTO member_profiles (user_id,full_name,status) VALUES ($1,$2,'active') RETURNING id",
    [userId, name]
  );
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
    [userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 60 * 60_000).toISOString()]
  );
  return {
    userId,
    memberId: String(profile.rows[0]?.id),
    token,
    csrfToken: csrfTokenFor(token, config.sessionSecret)
  };
}

test("PostgreSQL invitations activate a scoped account once without storing the raw token", {
  skip: !integrationEnabled
}, async (t: TestContext) => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5_000,
    application_name: "ikigai-invitation-integration-test"
  });
  const db = new PostgresDatabase(pool);
  const app = await buildApp(config, { db, transactionalDb: db });
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = randomUUID();
  const admin = await createActor(pool, `Invitation Admin ${suffix}`, "admin");
  const memberProfile = await pool.query(
    "INSERT INTO member_profiles (full_name,status,email) VALUES ($1,'trial',$2) RETURNING id",
    [`Invited Member ${suffix}`, `invitee-${suffix}@example.test`]
  );
  const targetMemberId = String(memberProfile.rows[0]?.id);
  const email = `invitee-${suffix}@example.test`;
  const adminHeaders = {
    origin,
    cookie: `ikigai_session=${admin.token}`,
    "x-csrf-token": admin.csrfToken
  };

  const created = await app.inject({
    method: "POST",
    url: "/api/v1/admin/invitations",
    headers: adminHeaders,
    payload: { email, role: "member", memberId: targetMemberId }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().invitation.role, "member");
  const creationAudit = await pool.query(
    "SELECT after_data FROM audit_events WHERE action='user.invitation_created' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 1",
    [created.json().invitation.userId]
  );
  assert.ok(creationAudit.rows[0]?.after_data);
  assert.equal("email" in (creationAudit.rows[0]?.after_data as Record<string, unknown>), false);
  const originalToken = String(created.json().invitationToken);
  const originalInvitationId = String(created.json().invitation.id);
  assert.ok(originalToken.length >= 40);

  const originalStored = await pool.query(
    "SELECT token_hash,revoked_at FROM user_invitations WHERE id=$1",
    [originalInvitationId]
  );
  assert.equal(originalStored.rows[0]?.token_hash, createHash("sha256").update(originalToken).digest("hex"));
  assert.notEqual(originalStored.rows[0]?.token_hash, originalToken);

  const resent = await app.inject({
    method: "POST",
    url: `/api/v1/admin/invitations/${originalInvitationId}/resend`,
    headers: adminHeaders
  });
  assert.equal(resent.statusCode, 201);
  const rawToken = String(resent.json().invitationToken);
  const replacementInvitationId = String(resent.json().invitation.id);
  assert.notEqual(replacementInvitationId, originalInvitationId);

  const revokedOriginal = await pool.query(
    "SELECT revoked_at FROM user_invitations WHERE id=$1",
    [originalInvitationId]
  );
  assert.ok(revokedOriginal.rows[0]?.revoked_at);

  const stored = await pool.query(
    "SELECT i.token_hash,u.status,u.email FROM user_invitations i JOIN users u ON u.id=i.user_id WHERE i.id=$1",
    [replacementInvitationId]
  );
  assert.equal(stored.rows[0]?.token_hash, createHash("sha256").update(rawToken).digest("hex"));
  assert.notEqual(stored.rows[0]?.token_hash, rawToken);
  assert.equal(stored.rows[0]?.status, "disabled");

  const oldTokenAttempt = await app.inject({
    method: "POST",
    url: "/api/v1/auth/accept-invitation",
    headers: { origin },
    payload: { token: originalToken, password: "a-long-test-password-2026" }
  });
  assert.equal(oldTokenAttempt.statusCode, 400);

  const password = "a-long-test-password-2026";
  const accepted = await app.inject({
    method: "POST",
    url: "/api/v1/auth/accept-invitation",
    headers: { origin },
    payload: { token: rawToken, password }
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json().accepted, true);
  const acceptedAudit = await pool.query(
    "SELECT after_data FROM audit_events WHERE action='user.invitation_accepted' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 1",
    [created.json().invitation.userId]
  );
  assert.ok(acceptedAudit.rows[0]?.after_data);
  assert.equal("email" in (acceptedAudit.rows[0]?.after_data as Record<string, unknown>), false);

  const activeUser = await pool.query(
    "SELECT status,password_hash FROM users WHERE email=$1",
    [email]
  );
  assert.equal(activeUser.rows[0]?.status, "active");
  assert.equal(await verifyPassword(password, String(activeUser.rows[0]?.password_hash)), true);

  const replay = await app.inject({
    method: "POST",
    url: "/api/v1/auth/accept-invitation",
    headers: { origin },
    payload: { token: rawToken, password }
  });
  assert.equal(replay.statusCode, 400);

  const audit = await pool.query(
    "SELECT action FROM audit_events WHERE entity_type='user' AND entity_id=$1 ORDER BY action",
    [created.json().invitation.userId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ["user.invitation_accepted", "user.invitation_created", "user.invitation_resent"]);

  const revokeProfile = await pool.query(
    "INSERT INTO member_profiles (full_name,status) VALUES ($1,'trial') RETURNING id",
    [`Revoked Invitee ${suffix}`]
  );
  const revokeInvite = await app.inject({
    method: "POST",
    url: "/api/v1/admin/invitations",
    headers: adminHeaders,
    payload: {
      email: `revoked-${suffix}@example.test`,
      role: "member",
      memberId: String(revokeProfile.rows[0]?.id)
    }
  });
  assert.equal(revokeInvite.statusCode, 201);
  const revokedToken = String(revokeInvite.json().invitationToken);
  const revoked = await app.inject({
    method: "POST",
    url: `/api/v1/admin/invitations/${revokeInvite.json().invitation.id}/revoke`,
    headers: adminHeaders
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.json().revoked, true);
  const revokedAcceptance = await app.inject({
    method: "POST",
    url: "/api/v1/auth/accept-invitation",
    headers: { origin },
    payload: { token: revokedToken, password }
  });
  assert.equal(revokedAcceptance.statusCode, 400);
});
