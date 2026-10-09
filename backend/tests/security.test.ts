import test from "node:test";
import assert from "node:assert/strict";
import { canAccessMember, canManageMembers, canRecordAttendance, createSessionToken, hashSessionToken, normalizeEmail, type AuthUser } from "../src/security.js";

const admin: AuthUser = { id: "admin", email: "admin@example.test", role: "admin", memberId: null, coachId: null };
const member: AuthUser = { id: "member-user", email: "member@example.test", role: "member", memberId: "member-1", coachId: null };
const coach: AuthUser = { id: "coach-user", email: "coach@example.test", role: "coach", memberId: null, coachId: "coach-1" };

test("session tokens are high entropy and are not stored as their own hash", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
  assert.notEqual(hashSessionToken(first, "pepper"), first);
  assert.equal(hashSessionToken(first, "pepper"), hashSessionToken(first, "pepper"));
  assert.notEqual(hashSessionToken(first, "pepper"), hashSessionToken(first, "different-pepper"));
});

test("email normalization is deterministic", () => {
  assert.equal(normalizeEmail("  Marcos@Example.COM "), "marcos@example.com");
});

test("members can access only their own member profile", () => {
  assert.equal(canAccessMember(member, "member-1"), true);
  assert.equal(canAccessMember(member, "member-2"), false);
  assert.equal(canManageMembers(member), false);
});

test("coaches can access only explicitly assigned members", () => {
  assert.equal(canAccessMember(coach, "member-1", new Set(["member-1"])), true);
  assert.equal(canAccessMember(coach, "member-2", new Set(["member-1"])), false);
  assert.equal(canManageMembers(coach), false);
});

test("administration has member access and may record attendance", () => {
  assert.equal(canAccessMember(admin, "any-member"), true);
  assert.equal(canManageMembers(admin), true);
  assert.equal(canRecordAttendance(admin, null), true);
});

test("coaches may record attendance only for their own class", () => {
  assert.equal(canRecordAttendance(coach, "coach-1"), true);
  assert.equal(canRecordAttendance(coach, "coach-2"), false);
  assert.equal(canRecordAttendance(member, "coach-1"), false);
});