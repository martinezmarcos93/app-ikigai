#!/usr/bin/env bash
# Ensayo de restauracion: restaura un respaldo en una base TEMPORAL dentro del contenedor de
# PostgreSQL, comprueba que el esquema y los datos estan, y borra la base temporal.
# NO toca la base real. Es el ensayo que da por bueno (o no) un respaldo.
#
#   deploy/restore-check.sh                              # usa el respaldo mas reciente de ./backups
#   deploy/restore-check.sh backups/ikigai-2026...dump   # uno en particular (sin cifrar)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/compose.yaml)
if [[ -n "${ENV_FILE:-}" ]]; then
  COMPOSE+=(--env-file "$ENV_FILE")
elif [[ -f deploy/.env ]]; then
  COMPOSE+=(--env-file deploy/.env)
fi
BACKUP_DIR="${BACKUP_DIR:-./backups}"
latest=""
for candidate in "$BACKUP_DIR"/ikigai-*.dump; do
  [[ -f "$candidate" && ( -z "$latest" || "$candidate" -nt "$latest" ) ]] && latest="$candidate"
done
dump="${1:-$latest}"
[[ -n "$dump" && -f "$dump" ]] || { echo "No hay un respaldo .dump para ensayar (si esta cifrado, descifrarlo antes)." >&2; exit 1; }

tmp="ikigai_restore_check_$(date +%s)"
psql_admin() { "${COMPOSE[@]}" exec -T db psql -U ikigai -d postgres -v ON_ERROR_STOP=1 -qtAc "$1"; }
cleanup() { psql_admin "DROP DATABASE IF EXISTS \"$tmp\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_admin "CREATE DATABASE \"$tmp\""
"${COMPOSE[@]}" exec -T db pg_restore -U ikigai -d "$tmp" --no-owner --exit-on-error < "$dump"

query() { "${COMPOSE[@]}" exec -T db psql -U ikigai -d "$tmp" -v ON_ERROR_STOP=1 -qtAc "$1"; }
migrations="$(query 'SELECT count(*) FROM schema_migrations')"
expected="$(find server/migrations -maxdepth 1 -name '*.sql' | wc -l)"
users="$(query 'SELECT count(*) FROM users')"
tables="$(query "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
audit="$(query 'SELECT count(*) FROM audit_events')"

[[ "$migrations" == "$expected" ]] || { echo "FALLO: $migrations migraciones restauradas, se esperaban $expected." >&2; exit 1; }
[[ "$users" -ge 1 ]] || { echo "FALLO: la base restaurada no tiene usuarios." >&2; exit 1; }
echo "Restauracion verificada de $(basename "$dump"): $migrations migraciones, $tables tablas, $users usuarios, $audit eventos de auditoria."
