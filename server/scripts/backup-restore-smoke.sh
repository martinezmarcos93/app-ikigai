#!/usr/bin/env bash
set -euo pipefail

: "\${DATABASE_URL:?Set DATABASE_URL to a disposable local PostgreSQL database}"
: "\${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a local maintenance database, usually postgres}"

check_local_url() {
  node --input-type=module - "$1" <<'NODE'
const raw = process.argv[2];
const url = new URL(raw);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error("Backup smoke test only permits local PostgreSQL hosts.");
}
if (!url.pathname || url.pathname === "/") {
  throw new Error("A database name must be present in each PostgreSQL URL.");
}
NODE
}

check_local_url "$DATABASE_URL"
check_local_url "$RESTORE_DATABASE_URL"

SOURCE_DB="$(node --input-type=module - "$DATABASE_URL" <<'NODE'
const url = new URL(process.argv[2]);
console.log(decodeURIComponent(url.pathname.slice(1)));
NODE
)"
RESTORE_ADMIN_DB="$(node --input-type=module - "$RESTORE_DATABASE_URL" <<'NODE'
const url = new URL(process.argv[2]);
console.log(decodeURIComponent(url.pathname.slice(1)));
NODE
)"
if [ "$SOURCE_DB" = "$RESTORE_ADMIN_DB" ]; then
  echo "RESTORE_DATABASE_URL must point to a maintenance database, not the source database." >&2
  exit 1
fi

RESTORE_DB_NAME="ikigai_restore_smoke_$(date +%s)_$$"
BACKUP_FILE="$(mktemp "\${TMPDIR:-/tmp}/ikigai-backup-XXXXXX.dump")"
RESTORE_URL="$(node --input-type=module - "$RESTORE_DATABASE_URL" "$RESTORE_DB_NAME" <<'NODE'
const url = new URL(process.argv[2]);
url.pathname = "/" + process.argv[3];
console.log(url.toString());
NODE
)"
created=0
cleanup() {
  if [ "$created" -eq 1 ]; then
    dropdb --if-exists --maintenance-db="$RESTORE_DATABASE_URL" "$RESTORE_DB_NAME" >/dev/null 2>&1 || true
  fi
  rm -f "$BACKUP_FILE"
}
trap cleanup EXIT

pg_dump --format=custom --no-owner --no-privileges --file="$BACKUP_FILE" "$DATABASE_URL"
psql "$RESTORE_DATABASE_URL" --set=ON_ERROR_STOP=1 --command="CREATE DATABASE $RESTORE_DB_NAME"
created=1
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$BACKUP_FILE"

psql "$RESTORE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command="SELECT to_regclass('public.users') IS NOT NULL" | grep -qx t
psql "$RESTORE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command="SELECT count(*) > 0 FROM public.schema_migrations" | grep -qx t

echo "Backup/restore smoke test passed: schema and migration history restored into a temporary local database."
