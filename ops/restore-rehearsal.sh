#!/usr/bin/env bash
set -euo pipefail
umask 077
# This tool is intentionally restricted to a disposable local rehearsal database.
# Use the Supabase managed recovery procedure for an actual hosted incident.
case "${PGHOST:-}" in localhost|127.0.0.1|::1) ;; *) echo "Restore requires a disposable localhost target" >&2; exit 1 ;; esac
[[ "${PGDATABASE:-}" =~ ^[a-z][a-z0-9_]*_restore$ ]] || { echo "Target name must end in _restore" >&2; exit 1; }
[[ "${RESTORE_CONFIRM:-}" == "$PGDATABASE" ]] || { echo "RESTORE_CONFIRM must equal PGDATABASE" >&2; exit 1; }
: "${PGUSER:?Set PGUSER}" "${AGE_IDENTITY_FILE:?Set age identity file path}"
# Prevent secondary libpq service/address settings from redirecting the target.
unset PGSERVICE PGSERVICEFILE PGHOSTADDR
export PGCONNECT_TIMEOUT=10
backup_file="${1:?Usage: bash ops/restore-rehearsal.sh snapshot.dump.age}"
objects="$(psql -X -w -At -v ON_ERROR_STOP=1 -c "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') + (select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in ('public','information_schema'));")"
[[ "$objects" == 0 ]] || { echo "Restore target is not empty; nothing changed" >&2; exit 1; }
restore_temp="$(mktemp -d)"
trap 'rm -rf "$restore_temp"' EXIT
# Authenticate the entire encrypted archive before changing the target database.
# TMPDIR must be an encrypted scratch volume or sufficiently sized tmpfs.
age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$restore_temp/database.dump" "$backup_file"
pg_restore --list "$restore_temp/database.dump" > /dev/null
pg_restore --no-password --exit-on-error --single-transaction --no-owner \
  --dbname "$PGDATABASE" "$restore_temp/database.dump"
echo "Local restore rehearsal completed; run application invariants before accepting recovery"
