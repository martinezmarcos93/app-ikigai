import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";
import {
  MIN_PASSPHRASE_LENGTH,
  encryptBackup,
  takeBackupSnapshot
} from "../domain/backup.js";

// Respaldo completo de la base, descargable solo por administracion y cifrado con una frase que elige quien lo pide.
// Ver docs/OPERATIONS_BACKUP_RESTORE.md. La frase no se guarda ni se registra; la auditoria anota quien lo pidio y los totales.

export function registerBackupRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  app.post<{ Body: { passphrase: string } }>("/api/v1/admin/backup", {
    schema: {
      body: {
        type: "object",
        required: ["passphrase"],
        additionalProperties: false,
        properties: { passphrase: { type: "string", minLength: MIN_PASSPHRASE_LENGTH, maxLength: 200 } }
      }
    },
    // Cada pedido deriva una clave con scrypt (~64 MiB) y lee toda la base: se limita fuerte.
    config: { rateLimit: { max: 3, timeWindow: "10 minutes" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send({ error: "unauthenticated", message: "A valid session is required." });
    if (!actor.roles.includes("admin")) return reply.code(403).send({ error: "forbidden", message: "Administrator permission is required." });
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;

    const payload = await takeBackupSnapshot(transactionalDb);

    const file = await encryptBackup(Buffer.from(JSON.stringify(payload), "utf8"), request.body.passphrase);
    await db.query(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'backup.downloaded','backup',$2,$3,$4::jsonb)",
      [actor.userId, payload.createdAt, request.id, JSON.stringify({ counts: payload.counts, bytes: file.length })]
    );
    const stamp = payload.createdAt.slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="ikigai-respaldo-${stamp}.ikbk"`)
      .send(file);
  });
}
