#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL database}"
command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore is required" >&2; exit 1; }
command -v createdb >/dev/null || { echo "createdb is required" >&2; exit 1; }
command -v dropdb >/dev/null || { echo "dropdb is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }

tmp_dir="$(mktemp -d)"
restore_db="ikigai_restore_check_${RANDOM}_${RANDOM}"
cleanup() {
  dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
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
createdb "$restore_db"
pg_restore --dbname="$restore_db" --no-owner --no-acl --exit-on-error "$tmp_dir/ikigai.dump"

restored_count="$(psql "$restore_db" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM users WHERE email='backup-restore-check@invalid.example'")"
if [[ "$restored_count" != "1" ]]; then
  echo "Backup restore verification failed: marker row missing." >&2
  exit 1
fi

migration_count="$(psql "$restore_db" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations")"
if [[ "$migration_count" -lt 4 ]]; then
  echo "Backup restore verification failed: expected at least four recorded migrations, got $migration_count." >&2
  exit 1
fi

echo "Backup/restore check passed: schema, migration history, and marker data restored."
