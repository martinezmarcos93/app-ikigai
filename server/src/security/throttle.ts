import { createHmac } from "node:crypto";
import type { Database } from "../db.js";

/** Intentos fallidos de acceso que se toleran por cuenta en la ventana antes de bloquearla un rato. */
export const ACCOUNT_FAILURE_LIMIT = 10;
export const ACCOUNT_WINDOW_SECONDS = 900;

/**
 * Identidad de red para los limites: una IPv6 se agrupa por /64 (un cliente recibe un /64 entero y rotar
 * direcciones dentro de el no debe dar intentos nuevos); IPv4 y las IPv4 mapeadas se usan tal cual.
 */
export function networkIdentity(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = ""] = ip.split("%");
  const [left = "", right] = head.split("::");
  const groups = left.split(":").filter(Boolean);
  if (right === undefined && groups.length >= 4) return groups.slice(0, 4).map(normalizeGroup).join(":") + "::/64";
  const padded = [...groups];
  while (padded.length < 4) padded.push("0");
  return padded.slice(0, 4).map(normalizeGroup).join(":") + "::/64";
}

function normalizeGroup(group: string): string {
  return group.toLowerCase().replace(/^0+(?=.)/, "");
}

function accountKey(sessionSecret: string, login: string): string {
  return createHmac("sha256", sessionSecret).update(`login-account:${login}`).digest("hex");
}

/**
 * Contador de fallos por cuenta (clave HMAC del usuario o correo normalizado, sin guardarlo en claro).
 * Se aplica a cualquier texto de usuario, exista o no, para no revelar que cuentas existen.
 */
export async function accountIsLocked(db: Database, sessionSecret: string, login: string): Promise<boolean> {
  const result = await db.query<{ request_count: number } & Record<string, unknown>>(
    `SELECT request_count FROM rate_limit_buckets
      WHERE bucket_key = $1 AND window_started_at > clock_timestamp() - ($2 * interval '1 second')`,
    [accountKey(sessionSecret, login), ACCOUNT_WINDOW_SECONDS]
  );
  return (result.rows[0]?.request_count ?? 0) >= ACCOUNT_FAILURE_LIMIT;
}

export async function recordAccountFailure(db: Database, sessionSecret: string, login: string): Promise<void> {
  await db.query(
    `INSERT INTO rate_limit_buckets (bucket_key, window_started_at, request_count, updated_at)
     VALUES ($1, clock_timestamp(), 1, clock_timestamp())
     ON CONFLICT (bucket_key) DO UPDATE SET
       request_count = CASE
         WHEN rate_limit_buckets.window_started_at <= clock_timestamp() - ($2 * interval '1 second') THEN 1
         ELSE rate_limit_buckets.request_count + 1
       END,
       window_started_at = CASE
         WHEN rate_limit_buckets.window_started_at <= clock_timestamp() - ($2 * interval '1 second') THEN clock_timestamp()
         ELSE rate_limit_buckets.window_started_at
       END,
       updated_at = clock_timestamp()`,
    [accountKey(sessionSecret, login), ACCOUNT_WINDOW_SECONDS]
  );
}

export async function clearAccountFailures(db: Database, sessionSecret: string, login: string): Promise<void> {
  await db.query("DELETE FROM rate_limit_buckets WHERE bucket_key = $1", [accountKey(sessionSecret, login)]);
}
