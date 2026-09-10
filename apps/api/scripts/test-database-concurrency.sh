#!/usr/bin/env bash
set -euo pipefail
case "${DATABASE_TEST_URL:-}" in
  postgres://*\@localhost:*/*|postgres://*\@127.0.0.1:*/*) ;;
  *) echo "Only disposable localhost test databases are supported" >&2; exit 1 ;;
esac
export PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=5000'
race_logs="$(mktemp -d)"
# Two independent connections compete for the same pending approval. Exactly
# one succeeds; the loser must observe the committed final state, not replay it.
request_id="$(psql "$DATABASE_TEST_URL" -X -At -v ON_ERROR_STOP=1 -c "select public.submit_operational_request('20000000-0000-4000-8000-000000000001','ROOM_BOOKING','{\"room_id\":\"30000000-0000-4000-8000-000000000001\",\"title\":\"Concurrent decision\",\"starts_at\":\"2027-08-01T09:00:00Z\",\"ends_at\":\"2027-08-01T10:00:00Z\"}',array['20000000-0000-4000-8000-000000000001'::uuid])->>'approval_request_id';")"
decision_sql="select public.decide_operational_request('20000000-0000-4000-8000-000000000001','$request_id','APPROVED');"
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -c "$decision_sql" > "$race_logs/first.log" 2>&1 &
first_pid=$!
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -c "$decision_sql" > "$race_logs/second.log" 2>&1 &
second_pid=$!
first_status=0; wait "$first_pid" || first_status=$?
second_status=0; wait "$second_pid" || second_status=$?
if ! { [[ "$first_status" == 0 && "$second_status" != 0 ]] || [[ "$first_status" != 0 && "$second_status" == 0 ]]; }; then
  echo "Expected exactly one winning decision; inspect $race_logs" >&2; exit 1
fi
actual="$(psql "$DATABASE_TEST_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.calendar_events e join public.room_bookings b on e.source_id=b.id where e.source_table='room_bookings' and b.approval_request_id='$request_id' and b.status='APPROVED';")"
test "$actual" = 1
echo "Concurrent decision regression passed: one finalization, one calendar event."
