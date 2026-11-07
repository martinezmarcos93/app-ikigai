import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Carga inicial de marcas del ranking de fuerza desde la planilla del gimnasio.
// Los datos de personas NO viven en el repositorio: se pasan como archivos externos.
//
//   cd server && export DATABASE_URL=... && npx tsx scripts/import-strength-marks.ts \
//     --marcas /ruta/marcas.csv --correspondencia /ruta/correspondencia.csv --admin admin@dominio [--aplicar]
//
// marcas.csv:          apodo,PP,P.45,DM,ST,PM,DESPE,PM (2),HPT   ("-" o vacío = sin marca; coma o punto decimal)
// correspondencia.csv: apodo,nombre   (nombre = member_profiles.full_name; lo que va entre paréntesis se ignora)
//
// Sin --aplicar solo muestra qué haría. Reglas:
// - Solo se cargan los apodos que están en la correspondencia; el resto se lista como omitido.
// - El miembro se busca por nombre completo exacto (sin distinguir mayúsculas), activo y no anonimizado.
//   Si no aparece o hay más de uno con ese nombre, se omite y se informa.
// - Si el miembro no tiene apodo de ranking, se le asigna el de la planilla ("MICA PEREZ" → "Mica Perez").
//   Si ya tiene uno, se respeta.
// - No duplica: una marca igual (miembro, ejercicio, peso y nota de importación) ya cargada se saltea.
// - Todo va en una transacción, con eventos de auditoría.

const NOTA = "Carga inicial desde la planilla del gimnasio";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseCsv(text: string): string[][] {
  return text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((c) => c.trim()));
}

export function aliasFrom(apodo: string): string {
  return apodo.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase()).slice(0, 24);
}

export function weightFrom(cell: string): number | null {
  const v = cell.trim();
  if (!v || v === "-") return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 2000) throw new Error(`Peso inválido en la planilla: "${cell}"`);
  return n;
}

async function main() {
  const marcasPath = arg("marcas"), corrPath = arg("correspondencia"), adminEmail = arg("admin")?.toLowerCase();
  const aplicar = process.argv.includes("--aplicar");
  if (!marcasPath || !corrPath || !adminEmail) throw new Error("Faltan --marcas, --correspondencia o --admin.");
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");

  const [header, ...rows] = parseCsv(await readFile(marcasPath, "utf8"));
  if (!header || header[0]?.toLowerCase() !== "apodo") throw new Error("marcas.csv debe empezar con la columna apodo.");
  const corr = new Map(parseCsv(await readFile(corrPath, "utf8")).slice(1).map(([a, n]) => [String(a).trim(), String(n).replace(/\(.*?\)/g, "").trim()]));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const resumen = { cargadas: 0, repetidas: 0, apodosAsignados: 0, omitidos: [] as string[] };
  try {
    await client.query("BEGIN");
    const admin = await client.query("SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin' WHERE lower(u.email) = $1", [adminEmail]);
    if (!admin.rows[0]) throw new Error(`No hay un admin con el correo ${adminEmail}.`);
    const adminId = admin.rows[0].id;
    const exercises = new Map((await client.query("SELECT id, code FROM strength_exercises")).rows.map((e) => [String(e.code), String(e.id)]));
    for (const code of header.slice(1)) if (!exercises.has(code)) throw new Error(`Ejercicio desconocido en la planilla: ${code}`);

    for (const row of rows) {
      const apodo = row[0] ?? "";
      const nombre = corr.get(apodo);
      if (!nombre) { resumen.omitidos.push(`${apodo}: sin correspondencia confirmada`); continue; }
      const members = await client.query(
        "SELECT id, ranking_alias FROM member_profiles WHERE lower(full_name) = lower($1) AND anonymized_at IS NULL AND status <> 'exited'", [nombre]);
      if (members.rows.length !== 1) { resumen.omitidos.push(`${apodo}: ${members.rows.length === 0 ? "no existe" : "hay varios"} miembro(s) "${nombre}"`); continue; }
      const member = members.rows[0];
      const marcas = header.slice(1).map((code, i) => [code, weightFrom(row[i + 1] ?? "")] as const).filter(([, w]) => w !== null);
      if (!marcas.length) { resumen.omitidos.push(`${apodo}: sin marcas en la planilla`); continue; }

      if (!member.ranking_alias) {
        const alias = aliasFrom(apodo);
        await client.query("UPDATE member_profiles SET ranking_alias = $1 WHERE id = $2", [alias, member.id]);
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, before_data, after_data) VALUES ($1,'member.ranking_alias_set','member',$2,$3::jsonb,$4::jsonb)",
          [adminId, member.id, JSON.stringify({ rankingAlias: null }), JSON.stringify({ rankingAlias: alias, source: "import" })]);
        resumen.apodosAsignados++;
        console.log(`  apodo ${apodo} → "${alias}"`);
      }
      for (const [code, weight] of marcas) {
        const exerciseId = exercises.get(code)!;
        const dup = await client.query("SELECT 1 FROM strength_records WHERE member_id = $1 AND exercise_id = $2 AND weight_kg = $3 AND notes = $4", [member.id, exerciseId, weight, NOTA]);
        if (dup.rowCount) { resumen.repetidas++; continue; }
        const rec = await client.query(
          "INSERT INTO strength_records (member_id, exercise_id, weight_kg, recorded_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [member.id, exerciseId, weight, adminId, NOTA]);
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, after_data) VALUES ($1,'strength_record.created','strength_record',$2,$3::jsonb)",
          [adminId, rec.rows[0].id, JSON.stringify({ memberId: member.id, exerciseId, weightKg: weight, source: "import" })]);
        resumen.cargadas++;
      }
    }
    if (aplicar) await client.query("COMMIT"); else await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`${aplicar ? "APLICADO" : "SIMULACIÓN (nada se guardó; agregá --aplicar)"}: ${resumen.cargadas} marcas nuevas, ${resumen.repetidas} ya estaban, ${resumen.apodosAsignados} apodos asignados.`);
  if (resumen.omitidos.length) console.log("Omitidos:\n  " + resumen.omitidos.join("\n  "));
}

main().catch((error) => { console.error("Falló la importación:", error instanceof Error ? error.message : error); process.exitCode = 1; });
