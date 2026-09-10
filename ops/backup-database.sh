#!/usr/bin/env bash
set -euo pipefail
umask 077
# libpq PG* variables/PGPASSFILE keep credentials out of command arguments.
: "${PGHOST:?Set PGHOST}" "${PGDATABASE:?Set PGDATABASE}" "${PGUSER:?Set PGUSER}"
: "${AGE_RECIPIENT:?Set the public age recipient}"
export PGCONNECT_TIMEOUT=10
backup_file="${1:?Usage: bash ops/backup-database.sh /secure/path/name.dump.age}"
[[ "$backup_file" == *.dump.age && ! -e "$backup_file" ]] || { echo "Use a new .dump.age path" >&2; exit 1; }
backup_temp="$(mktemp "${backup_file}.partial.XXXXXX")"
trap 'rm -f "$backup_temp"' EXIT
# Never write a plaintext archive to disk during backup; pipefail blocks publication
# if either dump or encryption fails. Include all readable schemas in this database.
pg_dump --no-password --format=custom --lock-wait-timeout=10s \
  | age --recipient "$AGE_RECIPIENT" > "$backup_temp"
[[ -s "$backup_temp" ]]
# Hard-link publication is atomic and refuses to overwrite an existing backup.
ln "$backup_temp" "$backup_file"
echo "Encrypted database snapshot created"
