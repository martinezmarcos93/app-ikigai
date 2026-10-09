import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Database } from "../db.js";

export interface AuthenticatedActor {
  userId: string;
  email: string;
  roles: string[];
  memberId: string | null;
  coachId: string | null;
  sessionId: string;
  sessionToken: string;
}

interface ActorRow extends Record<string, unknown> {
  session_id: string;
  user_id: string;
  email: string;
  roles: string[];
  member_id: string | null;
  coach_id: string | null;
}

export async function resolveActor(
  request: FastifyRequest,
  db: Database
): Promise<AuthenticatedActor | null> {
  const token = request.cookies?.ikigai_session;
  if (!token || token.length > 128) return null;

  const result = await db.query<ActorRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email,
            array_remove(array_agg(DISTINCT ur.role), NULL) AS roles,
            mp.id AS member_id, cp.id AS coach_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      GROUP BY s.id, u.id, u.email, mp.id, cp.id
      LIMIT 1`,
    [tokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    email: row.email,
    roles: row.roles ?? [],
    memberId: row.member_id,
    coachId: row.coach_id,
    sessionId: row.session_id,
    sessionToken: token
  };
}

function tokenHash(token: string): string {
  // The database stores only the digest of the opaque cookie token.
  return createHashSha256(token);
}

function createHashSha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function canAccessMember(
  actor: AuthenticatedActor,
  targetMemberId: string,
  coachScopeAllowed = false
): boolean {
  if (actor.roles.includes("admin")) return true;
  if (actor.roles.includes("member") && actor.memberId === targetMemberId) return true;
  return actor.roles.includes("coach") && Boolean(actor.coachId) && coachScopeAllowed;
}

export async function coachHasMemberScope(
  db: Database,
  coachId: string,
  memberId: string
): Promise<boolean> {
  const result = await db.query<{ allowed: boolean } & Record<string, unknown>>(
    `SELECT EXISTS (
       SELECT 1
         FROM recurring_assignments ra
         JOIN class_templates ct ON ct.id = ra.template_id
        WHERE ra.member_id = $1
          AND ct.coach_id = $2
          AND ra.active = true
          AND ra.starts_on <= CURRENT_DATE
          AND (ra.ends_on IS NULL OR ra.ends_on >= CURRENT_DATE)
       UNION
       SELECT 1
         FROM bookings b
         JOIN class_sessions cs ON cs.id = b.session_id
         JOIN class_templates ct ON ct.id = cs.template_id
        WHERE b.member_id = $1
          AND ct.coach_id = $2
          AND b.status IN ('confirmed', 'waitlist')
          AND cs.starts_at BETWEEN now() - interval '30 days' AND now() + interval '30 days'
     ) AS allowed`,
    [memberId, coachId]
  );
  return result.rows[0]?.allowed === true;
}
