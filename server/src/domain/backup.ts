import { randomBytes, createCipheriv, createDecipheriv, scrypt as scryptCallback, type BinaryLike } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { TransactionalDatabase } from "../db.js";

// Respaldo cifrado de la base: JSON comprimido y cifrado con una frase que elige quien lo descarga (administracion).
// Formato del archivo (.ikbk):
//   "IKBK" (4 bytes) | version (1 byte) | largo del encabezado (uint32 BE) | encabezado JSON | cifrado | etiqueta GCM (16 bytes)
// El encabezado (parametros de la derivacion de clave, sal e IV) viaja como dato autenticado adicional: si alguien lo
// altera, el descifrado falla. La clave sale de la frase con scrypt; la frase nunca se guarda.

const MAGIC = Buffer.from("IKBK", "ascii");
const VERSION = 1;
const TAG_BYTES = 16;
const KDF = { n: 2 ** 16, r: 8, p: 1 } as const;
const MAX_HEADER_BYTES = 1024;
export const MIN_PASSPHRASE_LENGTH = 12;

interface BackupHeader {
  kdf: { name: "scrypt"; n: number; r: number; p: number; salt: string };
  iv: string;
  cipher: "aes-256-gcm";
  compression: "gzip";
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFormatError";
  }
}

function deriveKey(passphrase: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(passphrase as BinaryLike, salt, 32, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function encryptBackup(plain: Buffer, passphrase: string): Promise<Buffer> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new BackupFormatError("La frase del respaldo es demasiado corta.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header: BackupHeader = {
    kdf: { name: "scrypt", ...KDF, salt: salt.toString("base64") },
    iv: iv.toString("base64"),
    cipher: "aes-256-gcm",
    compression: "gzip"
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(MAGIC.length + 1 + 4);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt8(VERSION, MAGIC.length);
  prefix.writeUInt32BE(headerBytes.length, MAGIC.length + 1);
  const aad = Buffer.concat([prefix, headerBytes]);

  const key = await deriveKey(passphrase, salt, KDF.n, KDF.r, KDF.p);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([aad, encrypted, cipher.getAuthTag()]);
}

export async function decryptBackup(file: Buffer, passphrase: string): Promise<Buffer> {
  const prefixLength = MAGIC.length + 1 + 4;
  if (file.length < prefixLength + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupFormatError("El archivo no es un respaldo de Ikigai.");
  }
  if (file.readUInt8(MAGIC.length) !== VERSION) throw new BackupFormatError("Version de respaldo no soportada.");
  const headerLength = file.readUInt32BE(MAGIC.length + 1);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || prefixLength + headerLength + TAG_BYTES > file.length) {
    throw new BackupFormatError("Encabezado de respaldo invalido.");
  }
  let header: BackupHeader;
  try {
    header = JSON.parse(file.subarray(prefixLength, prefixLength + headerLength).toString("utf8")) as BackupHeader;
  } catch {
    throw new BackupFormatError("Encabezado de respaldo invalido.");
  }
  if (header.cipher !== "aes-256-gcm" || header.compression !== "gzip" || header.kdf?.name !== "scrypt") {
    throw new BackupFormatError("Algoritmos de respaldo no soportados.");
  }
  // Los parametros vienen del archivo: se acotan para que un archivo malicioso no agote la memoria.
  const { n, r, p } = header.kdf;
  if (!Number.isInteger(n) || n < 2 ** 14 || n > 2 ** 17 || (n & (n - 1)) !== 0 || r !== 8 || p !== 1) {
    throw new BackupFormatError("Parametros de derivacion de clave fuera de rango.");
  }
  const aad = file.subarray(0, prefixLength + headerLength);
  const encrypted = file.subarray(prefixLength + headerLength, file.length - TAG_BYTES);
  const tag = file.subarray(file.length - TAG_BYTES);
  const key = await deriveKey(passphrase, Buffer.from(header.kdf.salt, "base64"), n, r, p);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  } catch {
    // Frase incorrecta o archivo alterado: no se distingue a proposito.
    throw new BackupFormatError("No se pudo descifrar: frase incorrecta o archivo alterado.");
  }
}

// Tablas incluidas en el respaldo, en orden de carga (padres antes que hijos). Quedan afuera a proposito las que solo
// guardan secretos efimeros: sesiones, claves de recuperacion, invitaciones pendientes y contadores de intentos.
export const BACKUP_TABLES = [
  "users",
  "user_roles",
  "institutional_settings",
  "member_profiles",
  "coach_profiles",
  "services",
  "memberships",
  "ledger_entries",
  "class_templates",
  "class_sessions",
  "recurring_assignments",
  "bookings",
  "booking_notices",
  "attendance_records",
  "coach_obligations",
  "coach_obligation_adjustments",
  "coach_payments",
  "exercises",
  "routines",
  "routine_versions",
  "routine_exercises",
  "routine_assignments",
  "announcements",
  "announcement_reads",
  "reward_settings",
  "game_runs",
  "reward_points",
  "weekly_prizes",
  "audit_events"
] as const;

export const BACKUP_FORMAT = "ikigai-backup/1";

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  migrations: string[];
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
}

export function parseBackupPayload(plain: Buffer): BackupPayload {
  let payload: BackupPayload;
  try {
    payload = JSON.parse(plain.toString("utf8")) as BackupPayload;
  } catch {
    throw new BackupFormatError("El contenido del respaldo no es valido.");
  }
  if (payload.format !== BACKUP_FORMAT || typeof payload.tables !== "object" || payload.tables === null) {
    throw new BackupFormatError("Formato de respaldo desconocido.");
  }
  return payload;
}

// Una sola foto consistente de toda la base: transaccion de lectura repetible y solo lectura.
export async function takeBackupSnapshot(transactionalDb: TransactionalDatabase): Promise<BackupPayload> {
  return transactionalDb.transaction(async (tx): Promise<BackupPayload> => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const migrations = await tx.query("SELECT name FROM schema_migrations ORDER BY name");
    const tables: Record<string, Record<string, unknown>[]> = {};
    const counts: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      // Los nombres salen de la lista fija BACKUP_TABLES, nunca de la entrada del usuario.
      const result = await tx.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY 1`);
      tables[table] = result.rows.map((row) => row.row as Record<string, unknown>);
      counts[table] = tables[table].length;
    }
    return {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      migrations: migrations.rows.map((row) => String(row.name)),
      counts,
      tables
    };
  });
}
