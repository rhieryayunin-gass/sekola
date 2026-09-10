#!/usr/bin/env bash
set -euo pipefail
# Refuse non-local databases. This script creates roles/schema for a fresh test DB.
case "${DATABASE_TEST_URL:-}" in
  postgres://*\@localhost:*/*|postgres://*\@127.0.0.1:*/*) ;;
  *) echo "DATABASE_TEST_URL must target a disposable localhost database" >&2; exit 1 ;;
esac
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
db_root="$repo_root/apps/api/database"
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -f "$db_root/tests/bootstrap.sql"
for migration in "$db_root"/migrations/*.sql; do
  # 0010 reconciles a legacy administrator that predates versioned migrations.
  # Model that prerequisite explicitly; never change an already-applied migration.
  if [[ "$(basename "$migration")" == 0010_* ]]; then
    psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -c "insert into public.roles(code,name) values('ADMIN','Legacy Administrator');"
  fi
  psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$migration"
  if [[ "$(basename "$migration")" == 0055_* ]]; then
    psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -f "$db_root/tests/seed_phase50.sql"
  fi
done
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -f "$db_root/tests/phase51_54.sql"
bash "$repo_root/apps/api/scripts/test-database-concurrency.sh"
