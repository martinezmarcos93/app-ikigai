import { createHash } from "node:crypto";
import type { Database } from "../db.js";

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  retryAfterSeconds: number;
}

export function opaqueRateLimitKey(namespace: string, value: string): string {
  const digest = createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
  return \`\${namespace}:\${digest}\`;
}

/**
 * Atomic PostgreSQL-backed fixed-window counter shared by all API instances.
 * The key must be opaque; do not persist raw IP addresses or email addresses.
 * Expired counters are pruned in the same statement to keep storage bounded.
 */
export async function consumeSharedRateLimit(
  db: Database,
  key: string,
  maxHits: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!Number.isInteger(maxHits) || maxHits < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Rate-limit settings must be positive integers.");
  }

  const result = await db.query<{ hits: number; retry_after_seconds: number } & Record<string, unknown>>(
    "WITH cleanup AS (DELETE FROM auth_rate_limit_buckets WHERE expires_at < now()) " +
    "INSERT INTO auth_rate_limit_buckets (bucket_key, window_started_at, hits, expires_at, updated_at) " +
    "VALUES ($1, now(), 1, now() + ($2 * interval '1 second'), now()) " +
    "ON CONFLICT (bucket_key) DO UPDATE SET " +
    "hits = CASE WHEN auth_rate_limit_buckets.window_started_at <= now() - ($2 * interval '1 second') " +
    "THEN 1 ELSE auth_rate_limit_buckets.hits + 1 END, " +
    "window_started_at = CASE WHEN auth_rate_limit_buckets.window_started_at <= now() - ($2 * interval '1 second') " +
    "THEN now() ELSE auth_rate_limit_buckets.window_started_at END, " +
    "expires_at = now() + ($2 * interval '1 second'), updated_at = now() " +
    "RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_started_at + ($2 * interval '1 second') - now()))))::int AS retry_after_seconds",
    [key, windowSeconds]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Shared rate-limit counter did not return a result.");
  return {
    allowed: Number(row.hits) <= maxHits,
    hits: Number(row.hits),
    retryAfterSeconds: Number(row.retry_after_seconds)
  };
}
