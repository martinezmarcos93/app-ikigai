import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Database, QueryResult, TransactionalDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { csrfTokenFor } from "../src/security/csrf.js";
import {
  BACKUP_TABLES,
  BackupFormatError,
  decryptBackup,
  encryptBackup,
  parseBackupPayload
} from "../src/domain/backup.js";

const origin = "https://app.example.com";
const secret = "test-session-secret-with-more-than-32-characters";
const sessionToken = "backup-test-session-token";
const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
const passphrase = "frase-de-prueba-larga";

// --- Cifrado --------------------------------------------------------------------------------------

test("un respaldo cifrado se descifra con la misma frase y no contiene el texto en claro", async () => {
  const plain = Buffer.from(JSON.stringify({ nota: "dato-sensible-de-prueba" }), "utf8");
  const file = await encryptBackup(plain, passphrase);
  assert.equal(file.subarray(0, 4).toString("ascii"), "IKBK");
  assert.ok(!file.includes(Buffer.from("dato-sensible-de-prueba")));
  assert.deepEqual(await decryptBackup(file, passphrase), plain);
});

test("dos respaldos del mismo contenido difieren (sal e IV aleatorios)", async () => {
  const plain = Buffer.from("igual");
  const [a, b] = await Promise.all([encryptBackup(plain, passphrase), encryptBackup(plain, passphrase)]);
  assert.notDeepEqual(a, b);
});

test("una frase incorrecta o un archivo alterado no se descifran", async () => {
  const file = await encryptBackup(Buffer.from("contenido"), passphrase);
  await assert.rejects(decryptBackup(file, "otra-frase-distinta"), BackupFormatError);
  const flippedBody = Buffer.from(file);
  flippedBody[flippedBody.length - 20] = (flippedBody[flippedBody.length - 20] ?? 0) ^ 0xff;
  await assert.rejects(decryptBackup(flippedBody, passphrase), BackupFormatError);
  // El encabezado tambien esta autenticado: cambiar la sal (aunque siga siendo base64 valido) rompe el descifrado.
  const headerLength = file.readUInt32BE(5);
  const header = file.subarray(9, 9 + headerLength).toString("utf8").replace(/"salt":"./, (m) => m.slice(0, -1) + (m.endsWith("A") ? "B" : "A"));
  const tampered = Buffer.concat([file.subarray(0, 9), Buffer.from(header), file.subarray(9 + headerLength)]);
  await assert.rejects(decryptBackup(tampered, passphrase), BackupFormatError);
});

test("se rechazan frases cortas, archivos ajenos y parametros de clave fuera de rango", async () => {
  await assert.rejects(encryptBackup(Buffer.from("x"), "corta"), BackupFormatError);
  await assert.rejects(decryptBackup(Buffer.from("no soy un respaldo, solo texto"), passphrase), BackupFormatError);
  const file = await encryptBackup(Buffer.from("x"), passphrase);
  const headerLength = file.readUInt32BE(5);
  const header = file.subarray(9, 9 + headerLength).toString("utf8").replace('"n":65536', '"n":1099511627776');
  const hostile = Buffer.concat([file.subarray(0, 5), Buffer.alloc(4), Buffer.from(header), file.subarray(9 + headerLength)]);
  hostile.writeUInt32BE(Buffer.byteLength(header), 5);
  await assert.rejects(decryptBackup(hostile, passphrase), /fuera de rango/);
});

test("parseBackupPayload rechaza contenido que no es un respaldo de Ikigai", () => {
  assert.throws(() => parseBackupPayload(Buffer.from("no es json")), BackupFormatError);
  assert.throws(() => parseBackupPayload(Buffer.from(JSON.stringify({ format: "otro" }))), BackupFormatError);
});

// --- Cobertura de tablas ----------------------------------------------------------------------------

test("toda tabla de las migraciones esta en el respaldo o en la lista de exclusiones documentada", async () => {
  const EXCLUIDAS = new Set(["sessions", "password_reset_tokens", "user_invitations", "rate_limit_buckets", "schema_migrations"]);
  const dir = new URL("../migrations/", import.meta.url);
  const created = new Set<string>();
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql"))) {
    const sql = await readFile(new URL(name, dir), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)) created.add(String(m[1]).toLowerCase());
  }
  const included = new Set<string>(BACKUP_TABLES);
  const missing = [...created].filter((t) => !included.has(t) && !EXCLUIDAS.has(t));
  assert.deepEqual(missing, [], `Tablas nuevas sin decidir si van al respaldo: ${missing.join(", ")}`);
  for (const t of included) assert.ok(created.has(t), `BACKUP_TABLES nombra una tabla inexistente: ${t}`);
});

// --- Ruta -----------------------------------------------------------------------------------------

class FakeDatabase implements TransactionalDatabase {
  readonly audits: unknown[][] = [];
  constructor(readonly roles: string[]) {}
  async query<Row extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM sessions s") && values[0] === tokenHash) {
      rows = [{
        session_id: "session-id", user_id: randomUUID(), id: randomUUID(), email: "actor@example.com",
        roles: this.roles, member_id: null, coach_id: null
      }];
    } else if (sql.includes("FROM schema_migrations")) {
      rows = [{ name: "0001_initial_schema.sql" }];
    } else if (sql.includes("to_jsonb(t)") && sql.includes("FROM services")) {
      rows = [{ row: { id: "s1", name: "Funcional de prueba" } }];
    } else if (sql.includes("to_jsonb(t)")) {
      rows = [];
    } else if (sql.includes("INSERT INTO audit_events")) {
      this.audits.push(values);
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }
  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

async function appFor(roles: string[]) {
  const db = new FakeDatabase(roles);
  const app = await buildApp(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: origin, SESSION_SECRET: secret }), { db, transactionalDb: db });
  return { app, db };
}

const headers = { origin, cookie: `ikigai_session=${sessionToken}`, "x-csrf-token": csrfTokenFor(sessionToken, secret) };

test("administracion descarga un respaldo cifrado que se descifra con su frase y queda auditado", async () => {
  const { app, db } = await appFor(["admin"]);
  const res = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers, payload: { passphrase } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/octet-stream");
  assert.match(String(res.headers["content-disposition"]), /^attachment; filename="ikigai-respaldo-\d{8}-\d{4}\.ikbk"$/);
  assert.equal(res.headers["cache-control"], "no-store");
  const payload = parseBackupPayload(await decryptBackup(res.rawPayload, passphrase));
  assert.equal(payload.counts.services, 1);
  assert.deepEqual(payload.migrations, ["0001_initial_schema.sql"]);
  assert.equal(Object.keys(payload.tables).length, BACKUP_TABLES.length);
  assert.equal(db.audits.length, 1);
  assert.ok(!JSON.stringify(db.audits).includes(passphrase), "la frase no puede quedar en la auditoria");
  await app.close();
});

test("miembros, profesores y anonimos no pueden pedir el respaldo", async () => {
  for (const roles of [["member"], ["coach"]]) {
    const { app } = await appFor(roles);
    const res = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers, payload: { passphrase } });
    assert.equal(res.statusCode, 403, roles.join());
    await app.close();
  }
  const { app } = await appFor(["admin"]);
  const anon = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers: { origin }, payload: { passphrase } });
  assert.equal(anon.statusCode, 401);
  await app.close();
});

test("sin CSRF valido o con frase corta o con campos de mas se rechaza", async () => {
  const { app } = await appFor(["admin"]);
  const noCsrf = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers: { ...headers, "x-csrf-token": "mal" }, payload: { passphrase } });
  assert.equal(noCsrf.statusCode, 403);
  const short = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers, payload: { passphrase: "corta" } });
  assert.equal(short.statusCode, 400);
  const extra = await app.inject({ method: "POST", url: "/api/v1/admin/backup", headers, payload: { passphrase, tablas: "todas" } });
  assert.equal(extra.statusCode, 400);
  await app.close();
});
