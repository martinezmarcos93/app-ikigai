import test from "node:test";
import assert from "node:assert/strict";
import { canAccessMember, type AuthenticatedActor } from "../src/security/actor.js";

function actor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: "user-1",
    email: "user@example.test",
    roles: ["member"],
    memberId: "member-1",
    coachId: null,
    sessionId: "session-1",
    sessionToken: "opaque-session-token",
    ...overrides
  };
}

test("authorization scope matrix keeps members inside their own profile", () => {
  const member = actor();
  assert.equal(canAccessMember(member, "member-1"), true);
  assert.equal(canAccessMember(member, "member-2"), false);
  assert.equal(canAccessMember(actor({ memberId: null }), "member-1"), false);
});

test("administrators can access any member while coach access requires explicit scope", () => {
  assert.equal(canAccessMember(actor({ roles: ["admin"], memberId: null }), "member-2"), true);
  const coach = actor({ roles: ["coach"], memberId: null, coachId: "coach-1" });
  assert.equal(canAccessMember(coach, "member-2"), false);
  assert.equal(canAccessMember(coach, "member-2", true), true);
  assert.equal(canAccessMember(actor({ roles: ["coach"], coachId: null, memberId: null }), "member-2", true), false);
});

test("mixed-role actors follow explicit admin/member/coach scope rules", () => {
  const mixed = actor({ roles: ["member", "coach"], coachId: "coach-1" });
  assert.equal(canAccessMember(mixed, "member-1"), true);
  assert.equal(canAccessMember(mixed, "member-2"), false);
  assert.equal(canAccessMember(mixed, "member-2", true), true);
});
