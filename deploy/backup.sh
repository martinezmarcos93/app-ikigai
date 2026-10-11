#!/usr/bin/env bash
# Respaldo de la base de Ikigai: volcado en formato custom (pg_dump -Fc) con retencion.
#
#   deploy/backup.sh                 # un respaldo en ./backups
#   BACKUP_DIR=/mnt/respaldos RETENTION_DAYS=30 deploy/backup.sh
#   AGE_RECIPIENT=age1... deploy/backup.sh   # ademas lo cifra con age (https://age-encryption.org)
#
# Programarlo (cron, todos los dias a las 03:15):
#   15 3 * * * cd /ruta/al/repo && deploy/backup.sh >> /var/log/ikigai-backup.log 2>&1
#
# Un respaldo que nunca se restauro no es un respaldo: correr deploy/restore-check.sh con regularidad.
# Guardar una copia FUERA del servidor (otro proveedor o disco): este script no la hace.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/compose.yaml)
if [[ -n "${ENV_FILE:-}" ]]; then
  COMPOSE+=(--env-file "$ENV_FILE")
elif [[ -f deploy/.env ]]; then
  COMPOSE+=(--env-file deploy/.env)
fi
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/ikigai-$stamp.dump"

"${COMPOSE[@]}" exec -T db pg_dump -U ikigai -d ikigai --format=custom --no-owner > "$out.partial"
[[ -s "$out.partial" ]] || { echo "El volcado quedo vacio: se descarta." >&2; rm -f "$out.partial"; exit 1; }
mv "$out.partial" "$out"

if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null || { echo "Falta 'age' para cifrar." >&2; exit 1; }
  age -r "$AGE_RECIPIENT" -o "$out.age" "$out"
  rm -f "$out"
  out="$out.age"
fi

# Retencion: se borran SOLO respaldos de esta herramienta con mas de RETENTION_DAYS dias.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'ikigai-*.dump*' -mtime +"$RETENTION_DAYS" -delete
echo "Respaldo listo: $out ($(du -h "$out" | cut -f1))"
