import "dotenv/config";
import pg from "pg";

// Carga INICIAL de los datos del negocio que el dueño respondio en el cuestionario (12/10/2026): datos del gimnasio y
// actividades. NO carga personas (ni profesores ni miembros), precios ni agenda: eso lo completa quien administra en el portal.
// Es seguro repetirlo: no pisa lo que ya se cargo (la configuracion solo se completa si esta vacia; las actividades solo se
// agregan si no existen).
//
//   cd server && read -rsp "DATABASE_URL: " DATABASE_URL && export DATABASE_URL && npm run seed:inicial

const SETTINGS = {
  institution_name: "Ikigai Training",
  contact_phone: "11 6282-1564",
  address: "Av. Fray Luis Beltrán 2202, esquina Pinto, Ituzaingó Sur",
  opening_hours: "Lunes a viernes de 8 a 12 hs y de 15 a 20 hs. Sábados de 9 a 15 hs."
} as const;

// Actividades que ofrece hoy (la zumba "esta por agregarse": se da de alta desde el portal cuando arranque).
const SERVICES = [
  { name: "Kickboxing", description: "Desde los 9 años. Los menores entran con autorización del padre, madre o tutor." },
  { name: "Taekwondo", description: "Con clases para infantes." },
  { name: "Funcional", description: "Entrenamiento funcional. Algunas franjas tienen horario reducido." },
  { name: "Yoga", description: null }
] as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT institution_name, contact_email, contact_phone, address, opening_hours FROM institutional_settings WHERE id = 1");
    const row = current.rows[0] as Record<string, string | null> | undefined;
    const empty = !row || Object.values(row).every((v) => v === null || v === "");
    if (empty) {
      await client.query(
        `INSERT INTO institutional_settings (id, institution_name, contact_phone, address, opening_hours)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET institution_name = EXCLUDED.institution_name, contact_phone = EXCLUDED.contact_phone,
           address = EXCLUDED.address, opening_hours = EXCLUDED.opening_hours, updated_at = now()`,
        [SETTINGS.institution_name, SETTINGS.contact_phone, SETTINGS.address, SETTINGS.opening_hours]
      );
      console.log("Datos del gimnasio: cargados.");
    } else {
      console.log("Datos del gimnasio: ya había datos, no se tocan.");
    }
    let created = 0;
    for (const service of SERVICES) {
      const exists = await client.query("SELECT 1 FROM services WHERE active AND lower(name) = lower($1)", [service.name]);
      if (exists.rowCount) continue;
      await client.query("INSERT INTO services (name, description, current_price) VALUES ($1, $2, NULL)", [service.name, service.description]);
      created += 1;
    }
    console.log(`Actividades: ${created} creadas, ${SERVICES.length - created} ya existían. Sin precios: se cargan desde el portal.`);
    await client.query(
      "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, after_data) VALUES (NULL, 'seed.initial_business_data', 'system', 'seed-inicial', $1::jsonb)",
      [JSON.stringify({ settingsLoaded: empty, servicesCreated: created })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
