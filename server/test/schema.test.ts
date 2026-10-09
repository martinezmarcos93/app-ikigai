import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/0001_initial_schema.sql", import.meta.url), "utf8");

test("initial migration defines the core operational entities", () => {
  for (const table of [
    "users", "user_roles", "member_profiles", "coach_profiles", "services",
    "memberships", "ledger_entries", "class_templates", "class_sessions",
    "recurring_assignments", "bookings", "attendance_records", "coach_obligations",
    "coach_payments", "exercises", "routines", "routine_versions",
    "routine_exercises", "routine_assignments", "audit_events"
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE " + table + "\\b", "i"), `missing table: ${table}`);
  }
});

test("schema protects active booking uniqueness and capacity bounds", () => {
  assert.match(sql, /bookings_one_active_member_per_session/i);
  assert.match(sql, /WHERE status IN \\('confirmed', 'waitlist'\\)/i);
  assert.match(sql, /capacity_snapshot smallint NOT NULL CHECK \\(capacity_snapshot BETWEEN 1 AND 30\\)/i);
  assert.match(sql, /UNIQUE\\(template_id, starts_at\\)/i);
});

test("financial and audit evidence is append-only", () => {
  assert.match(sql, /CREATE TRIGGER ledger_entries_append_only/i);
  assert.match(sql, /CREATE TRIGGER coach_payments_append_only/i);
  assert.match(sql, /CREATE TRIGGER audit_events_append_only/i);
  assert.match(sql, /reject_immutable_record_mutation/i);
});

test("money uses exact numeric types and monthly obligations are period-scoped", () => {
  assert.match(sql, /amount numeric\\(12,2\\)/i);
  assert.match(sql, /UNIQUE\\(coach_id, period\\)/i);
  assert.doesNotMatch(sql, /share\\s+numeric|percentage_share/i);
});
