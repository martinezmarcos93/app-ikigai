import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

const editableFields = ["institution_name", "contact_email", "contact_phone", "address", "opening_hours"] as const;
type EditableField = typeof editableFields[number];
type SettingsBody = Partial<Record<EditableField, string | null>>;

interface SettingsRow extends Record<string, unknown> {
  institution_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  opening_hours: string | null;
  updated_at: string | Date;
}

class SettingsError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof SettingsError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  throw error;
}

function normalize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function publicSettings(row: SettingsRow) {
  return {
    institution_name: row.institution_name,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    address: row.address,
    opening_hours: row.opening_hours,
    updated_at: new Date(row.updated_at).toISOString()
  };
}

export function registerInstitutionalSettingsRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.get("/api/v1/admin/institution-settings", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });

    const result = await db.query<SettingsRow>(
      "SELECT institution_name, contact_email, contact_phone, address, opening_hours, updated_at FROM institutional_settings WHERE id=1",
      []
    );
    const row = result.rows[0];
    if (!row) return reply.code(503).send({ error: "settings_unavailable", message: "Institution settings are not initialized. Apply database migrations." });
    return reply.send({ settings: publicSettings(row) });
  });

  app.patch<{ Body: SettingsBody }>("/api/v1/admin/institution-settings", {
    schema: {
      body: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          institution_name: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
          contact_email: { anyOf: [{ type: "string", format: "email", maxLength: 254 }, { type: "null" }] },
          contact_phone: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
          address: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
          opening_hours: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "null" }] }
        }
      }
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const patch = Object.fromEntries(
      editableFields.filter((key) => Object.hasOwn(request.body, key))
        .map((key) => [key, normalize(request.body[key])])
    ) as Partial<Record<EditableField, string | null>>;
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: "empty_settings_update", message: "Provide at least one setting to update." });
    }
    if (patch.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.contact_email)) {
      return reply.code(400).send({ error: "invalid_contact_email", message: "The contact email is not valid." });
    }

    try {
      const settings = await transactionalDb.transaction(async (tx) => {
        const beforeResult = await tx.query<SettingsRow>(
          "SELECT institution_name, contact_email, contact_phone, address, opening_hours, updated_at FROM institutional_settings WHERE id=1 FOR UPDATE",
          []
        );
        const before = beforeResult.rows[0];
        if (!before) throw new SettingsError(503, "settings_unavailable", "Institution settings are not initialized. Apply database migrations.");
        const columns = Object.keys(patch) as EditableField[];
        const values = columns.map((key) => patch[key]);
        const assignments = columns.map((key, index) => `${key}=$${index + 1}`);
        assignments.push(`updated_by=$${values.length + 1}`, "updated_at=now()");
        const updated = await tx.query<SettingsRow>(
          `UPDATE institutional_settings SET ${assignments.join(", ")} WHERE id=1 RETURNING institution_name, contact_email, contact_phone, address, opening_hours, updated_at`,
          [...values, actor.userId]
        );
        const row = updated.rows[0];
        if (!row) throw new SettingsError(503, "settings_unavailable", "Institution settings could not be updated.");
        await tx.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, request_id, before_data, after_data) VALUES ($1, 'institution.settings_updated', 'institutional_settings', '1', $2, $3::jsonb, $4::jsonb)",
          [actor.userId, request.id, JSON.stringify({ changedFields: columns }), JSON.stringify({ changedFields: columns })]
        );
        return publicSettings(row);
      });
      return reply.send({ settings });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
