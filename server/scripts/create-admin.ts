import "dotenv/config";
import pg from "pg";
import { hashPassword } from "../src/security/password.js";

const connectionString = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
// ADMIN_MUST_CHANGE_PASSWORD=1: la clave entregada es temporal y quien administra la cambia al entrar por primera vez.
const mustChange = process.env.ADMIN_MUST_CHANGE_PASSWORD === "1";

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_EMAIL must be a valid email address.");
}
if (!password || password.length < 12 || password.length > 128) {
  throw new Error("ADMIN_PASSWORD must contain between 12 and 128 characters.");
}

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existing.rowCount) {
      throw new Error("An account with ADMIN_EMAIL already exists; refusing to overwrite it.");
    }
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash, auth_provider, status, must_change_password)
       VALUES ($1, $2, 'local', 'active', $3)
       RETURNING id`,
      [email, passwordHash, mustChange]
    );
    const userId = inserted.rows[0]?.id as string | undefined;
    if (!userId) throw new Error("Could not create the administrator account.");
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')",
      [userId]
    );
    await client.query("COMMIT");
    console.log(`Created administrator account for ${email}. The password was not printed.${mustChange ? " It must be changed at first sign-in." : ""}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
