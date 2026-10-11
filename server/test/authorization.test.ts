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
    mustChangePassword: false,
    ...overrides
  };
}

test("members can access only their own linked profile", () => {
  const member = actor();
  assert.equal(canAccessMember(member, "member-1"), true);
  assert.equal(canAccessMember(member, "member-2"), false);
  assert.equal(canAccessMember(actor({ memberId: null }), "member-1"), false);
});

test("coach access requires a linked coach profile and server-verified scope", () => {
  const coach = actor({ roles: ["coach"], memberId: null, coachId: "coach-1" });
  assert.equal(canAccessMember(coach, "member-2"), false);
  assert.equal(canAccessMember(coach, "member-2", true), true);
  assert.equal(canAccessMember(actor({ roles: ["coach"], memberId: null, coachId: null }), "member-2", true), false);
});

test("administrators can access any member regardless of profile linkage", () => {
  assert.equal(canAccessMember(actor({ roles: ["admin"], memberId: null, coachId: null }), "member-2"), true);
});

test("mixed-role actors keep self-scope but require explicit coach scope for others", () => {
  const mixed = actor({ roles: ["member", "coach"], coachId: "coach-1" });
  assert.equal(canAccessMember(mixed, "member-1"), true);
  assert.equal(canAccessMember(mixed, "member-2"), false);
  assert.equal(canAccessMember(mixed, "member-2", true), true);
});
