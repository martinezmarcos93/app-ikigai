#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable local PostgreSQL database}"

# This check must run before invoking any PostgreSQL client or creating temporary files.
# The script writes a marker row and creates/drops a database, so remote hosts are forbidden.
node --input-type=module - "$DATABASE_URL" <<'NODE'
const raw = process.argv[2];
let url;
try {
  url = new URL(raw);
} catch {
  console.error("DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}
if (!["postgres:", "postgresql:"].includes(url.protocol)) {
  console.error("DATABASE_URL must use the postgres:// or postgresql:// scheme.");
  process.exit(1);
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  console.error("Backup/restore check refuses non-local PostgreSQL hosts.");
  process.exit(1);
}
if (!url.pathname || url.pathname === "/") {
  console.error("DATABASE_URL must include a database name.");
  process.exit(1);
}
NODE

command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }

tmp_dir="$(mktemp -d)"
restore_db="ikigai_restore_check_${RANDOM}_${RANDOM}"
cleanup() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$restore_db\"" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

# A deterministic marker proves that restore brings back data, not only DDL.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  INSERT INTO users (email,password_hash,auth_provider,status)
  VALUES ('backup-restore-check@invalid.example','not-a-real-password-hash','local','disabled')
  ON CONFLICT (email) DO NOTHING;
" >/dev/null

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$tmp_dir/ikigai.dump"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$restore_db\"" >/dev/null
restore_url="$(node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.argv[1]; process.stdout.write(u.toString())' "$restore_db")"
pg_restore --dbname="$restore_url" --no-owner --no-acl --exit-on-error "$tmp_dir/ikigai.dump"

restored_count="$(psql "$restore_url" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM users WHERE email='backup-restore-check@invalid.example'")"
if [[ "$restored_count" != "1" ]]; then
  echo "Backup restore verification failed: marker row missing." >&2
  exit 1
fi

migration_count="$(psql "$restore_url" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations")"
if [[ "$migration_count" -lt 4 ]]; then
  echo "Backup restore verification failed: expected at least four recorded migrations, got $migration_count." >&2
  exit 1
fi

echo "Backup/restore check passed: schema, migration history, and marker data restored."
