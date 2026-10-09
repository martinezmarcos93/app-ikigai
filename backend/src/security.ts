import { createHash, randomBytes } from "node:crypto";

export type Role = "admin" | "coach" | "member";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  memberId: string | null;
  coachId: string | null;
};

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, pepper: string): string {
  return createHash("sha256").update(token).update(pepper).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canAccessMember(user: AuthUser, memberId: string, assignedMemberIds: ReadonlySet<string> = new Set()): boolean {
  if (user.role === "admin") return true;
  if (user.role === "member") return user.memberId === memberId;
  return assignedMemberIds.has(memberId);
}

export function canManageMembers(user: AuthUser): boolean {
  return user.role === "admin";
}

export function canRecordAttendance(user: AuthUser, assignedCoachId: string | null): boolean {
  if (user.role === "admin") return true;
  return user.role === "coach" && user.coachId !== null && user.coachId === assignedCoachId;
}