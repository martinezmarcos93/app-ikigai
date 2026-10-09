import { createHmac } from "node:crypto";
import type { Database } from "../db.js";

let callsSinceCleanup = 0;

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  retryAfterSeconds: number;
}

/**
 * Use a keyed digest so predictable values such as IP addresses and email
 * addresses cannot be recovered by dictionary attacks against stored keys.
 * Rotating SESSION_SECRET resets the rate-limit namespaces, so rotate it only
 * as an intentional security operation.
 */
export function opaqueRateLimitKey(namespace: string, value: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
  return `${namespace}:${digest}`;
}

/**
 * Atomic PostgreSQL-backed fixed-window counter shared by all API instances.
 * Raw IP addresses and email addresses must never be persisted.
 * Expired counters are pruned opportunistically every 100 auth attempts.
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

  callsSinceCleanup += 1;
  if (callsSinceCleanup >= 100) {
    callsSinceCleanup = 0;
    await db.query("DELETE FROM auth_rate_limit_buckets WHERE expires_at < now()");
  }

  const result = await db.query<{ hits: number; retry_after_seconds: number } & Record<string, unknown>>(
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
