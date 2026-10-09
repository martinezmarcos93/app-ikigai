import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/0001_initial_schema.sql", import.meta.url), "utf8");
const sessionsSql = await readFile(new URL("../migrations/0002_sessions.sql", import.meta.url), "utf8");
const invitationsSql = await readFile(new URL("../migrations/0003_user_invitations.sql", import.meta.url), "utf8");
const authHardeningSql = await readFile(new URL("../migrations/0004_auth_hardening.sql", import.meta.url), "utf8");

test("initial migration defines the core operational entities", () => {
  for (const table of [
    "users", "user_roles", "member_profiles", "coach_profiles", "services",
    "memberships", "ledger_entries", "class_templates", "class_sessions",
    "recurring_assignments", "bookings", "attendance_records", "coach_obligations",
    "coach_obligation_adjustments", "coach_payments", "exercises", "routines", "routine_versions",
    "routine_exercises", "routine_assignments", "audit_events"
  ]) {
    assert.ok(sql.includes(`CREATE TABLE ${table} `), `missing table: ${table}`);
  }
});

test("schema protects active booking uniqueness and capacity bounds", () => {
  assert.ok(sql.includes("bookings_one_active_member_per_session"));
  assert.ok(sql.includes("WHERE status IN ('confirmed', 'waitlist')"));
  assert.ok(sql.includes("capacity_snapshot smallint NOT NULL CHECK (capacity_snapshot BETWEEN 1 AND 30)"));
  assert.ok(sql.includes("UNIQUE(template_id, starts_at)"));
});

test("financial and audit evidence is append-only", () => {
  assert.ok(sql.includes("CREATE TRIGGER ledger_entries_append_only"));
  assert.ok(sql.includes("CREATE TRIGGER coach_obligations_append_only"));
  assert.ok(sql.includes("CREATE TRIGGER coach_obligation_adjustments_append_only"));
  assert.ok(sql.includes("CREATE TRIGGER coach_payments_append_only"));
  assert.ok(sql.includes("CREATE TRIGGER audit_events_append_only"));
  assert.ok(sql.includes("reject_immutable_record_mutation"));
});

test("sessions store only a digest of opaque tokens and support revocation/expiry", () => {
  assert.ok(sessionsSql.includes("token_hash char(64) NOT NULL UNIQUE"));
  assert.ok(sessionsSql.includes("revoked_at timestamptz"));
  assert.ok(sessionsSql.includes("expires_at timestamptz NOT NULL"));
  assert.ok(sessionsSql.includes("REFERENCES users(id) ON DELETE RESTRICT"));
});

test("account invitations are one-time, expiring, and stored only as token digests", () => {
  assert.ok(invitationsSql.includes("token_hash char(64) NOT NULL UNIQUE"));
  assert.ok(invitationsSql.includes("expires_at timestamptz NOT NULL"));
  assert.ok(invitationsSql.includes("accepted_at timestamptz"));
  assert.ok(invitationsSql.includes("revoked_at timestamptz"));
  assert.ok(invitationsSql.includes("user_invitations_one_open_per_user"));
});

test("money uses exact numeric types and monthly obligations are period-scoped", () => {
  assert.ok(sql.includes("amount numeric(12,2)"));
  assert.ok(sql.includes("direction text NOT NULL CHECK"));
  assert.ok(sql.includes("ledger_idempotency_unique"));
  assert.ok(sql.includes("routine_assignment_unique"));
  assert.ok(sql.includes("memberships_member_service_start_unique"));
  assert.ok(sql.includes("request_hash char(64)"));
  assert.ok(sql.includes("UNIQUE(coach_id, period)"));
  assert.doesNotMatch(sql, /share\s+numeric|percentage_share/i);
});


test("auth hardening stores opaque shared rate-limit keys and one-time reset-token digests", () => {
  assert.ok(authHardeningSql.includes("CREATE TABLE auth_rate_limit_buckets"));
  assert.ok(authHardeningSql.includes("bucket_key text PRIMARY KEY"));
  assert.ok(authHardeningSql.includes("expires_at timestamptz NOT NULL"));
  assert.ok(authHardeningSql.includes("CREATE TABLE password_reset_tokens"));
  assert.ok(authHardeningSql.includes("token_hash char(64) NOT NULL UNIQUE"));
  assert.ok(authHardeningSql.includes("used_at timestamptz"));
  assert.ok(authHardeningSql.includes("password_reset_tokens_user_active_idx"));
});
