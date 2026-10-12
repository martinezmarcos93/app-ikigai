import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { BACKUP_TABLES, decryptBackup, parseBackupPayload } from "../src/domain/backup.js";

// Uso (desde server/):
//   IKIGAI_BACKUP_PASSPHRASE='...' npx tsx scripts/restore-backup.ts <archivo.ikbk>            -> solo verifica y muestra totales
//   IKIGAI_BACKUP_PASSPHRASE='...' npx tsx scripts/restore-backup.ts <archivo.ikbk> --restaurar -> carga en DATABASE_URL
// La frase se lee de la variable de entorno (no de argumentos, para que no quede en el historial del shell).
// Restaurar exige una base recien migrada y VACIA (npm run db:migrate): nunca pisa datos existentes.

// Tablas que las migraciones ya siembran con una fila por defecto: la del respaldo la reemplaza.
const SEEDED_BY_MIGRATIONS = new Set<string>(["institutional_settings"]);

const [file, ...flags] = process.argv.slice(2);
const passphrase = process.env.IKIGAI_BACKUP_PASSPHRASE;
if (!file || !passphrase) {
  console.error("Uso: IKIGAI_BACKUP_PASSPHRASE='...' tsx scripts/restore-backup.ts <archivo.ikbk> [--restaurar]");
  process.exit(2);
}

const payload = parseBackupPayload(await decryptBackup(await readFile(file), passphrase));
console.log(`Respaldo de ${payload.createdAt} (${payload.migrations.length} migraciones)`);
for (const table of BACKUP_TABLES) console.log(`  ${table.padEnd(30)} ${payload.counts[table] ?? 0}`);

if (!flags.includes("--restaurar")) {
  console.log("Verificado. Para cargarlo en DATABASE_URL, repetir con --restaurar.");
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL es obligatoria para restaurar.");
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000, application_name: "ikigai-restore" });
const client = await pool.connect();
try {
  const applied = (await client.query("SELECT name FROM schema_migrations ORDER BY name")).rows.map((r) => String(r.name));
  const missing = payload.migrations.filter((name) => !applied.includes(name));
  if (missing.length) throw new Error(`La base no tiene las migraciones del respaldo: ${missing.join(", ")}. Corré npm run db:migrate.`);
  for (const table of BACKUP_TABLES) {
    if (SEEDED_BY_MIGRATIONS.has(table)) continue;
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    if (Number(rows[0]?.n) > 0) throw new Error(`La tabla ${table} no esta vacia: se restaura solo sobre una base nueva.`);
  }
  await client.query("BEGIN");
  // Los triggers de inmutabilidad y las claves foraneas se suspenden solo durante la carga (requiere rol con permiso).
  await client.query("SET LOCAL session_replication_role = replica");
  for (const table of BACKUP_TABLES) {
    const rows = payload.tables[table] ?? [];
    if (SEEDED_BY_MIGRATIONS.has(table) && rows.length) await client.query(`DELETE FROM ${table}`);
    if (!rows.length) continue;
    await client.query(
      `INSERT INTO ${table} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(rows)]
    );
  }
  // Las identidades (audit_events.id) quedan en el maximo cargado para que los proximos eventos no choquen.
  await client.query(
    `SELECT setval(pg_get_serial_sequence('audit_events', 'id'), GREATEST((SELECT coalesce(max(id), 1) FROM audit_events), 1))`
  );
  for (const table of BACKUP_TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    if (Number(rows[0]?.n) !== (payload.counts[table] ?? 0)) throw new Error(`Cantidad distinta en ${table}: se cancela.`);
  }
  await client.query("COMMIT");
  console.log("Restauracion completa y verificada.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Restauracion cancelada:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
