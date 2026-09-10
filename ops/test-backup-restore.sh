#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGDATABASE:-}" == sekola_test ]] || { echo "Requires CI localhost fixture" >&2; exit 1; }
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
export AGE_IDENTITY_FILE="$test_dir/identity.agekey"
age-keygen -o "$AGE_IDENTITY_FILE" 2>/dev/null
export AGE_RECIPIENT
AGE_RECIPIENT="$(age-keygen -y "$AGE_IDENTITY_FILE")"
bash "$repo_root/ops/backup-database.sh" "$test_dir/fixture.dump.age"
createdb -T template0 sekola_restore
if PGHOST=remote.invalid PGDATABASE=sekola_restore RESTORE_CONFIRM=sekola_restore bash "$repo_root/ops/restore-rehearsal.sh" "$test_dir/fixture.dump.age"; then exit 1; fi
head -c 64 "$test_dir/fixture.dump.age" > "$test_dir/corrupt.dump.age"
if PGDATABASE=sekola_restore RESTORE_CONFIRM=sekola_restore bash "$repo_root/ops/restore-rehearsal.sh" "$test_dir/corrupt.dump.age"; then exit 1; fi
PGDATABASE=sekola_restore RESTORE_CONFIRM=sekola_restore bash "$repo_root/ops/restore-rehearsal.sh" "$test_dir/fixture.dump.age"
if PGDATABASE=sekola_restore RESTORE_CONFIRM=sekola_restore bash "$repo_root/ops/restore-rehearsal.sh" "$test_dir/fixture.dump.age"; then exit 1; fi
# Re-exercise RLS/tenant references, source synchronization, approval atomicity,
# finance integrity and data access after restoring actual migration fixtures.
PGDATABASE=sekola_restore psql -X -w -v ON_ERROR_STOP=1 -f "$repo_root/apps/api/database/tests/phase51_54.sql"
echo "Encrypted backup, restore, invariants, corruption and target-refusal checks passed"
