#!/usr/bin/env bash
set -euo pipefail
case "${DATABASE_TEST_URL:-}" in postgres://*\@localhost:*/*|postgres://*\@127.0.0.1:*/*) ;; *) echo 'Only disposable localhost databases are supported' >&2; exit 1;; esac
: "${POSTGRES_CONTAINER_ID:?Disposable CI PostgreSQL container is required}"
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -f "$repo_root/apps/api/database/tests/school_exam_load_seed.sql"
docker cp "$repo_root/apps/api/database/tests/school_exam_pgbench.sql" "$POSTGRES_CONTAINER_ID:/tmp/osekola-exam-benchmark.sql"
docker exec -u postgres "$POSTGRES_CONTAINER_ID" pgbench -U postgres -d sekola_test -n -c 64 -j 4 -T 20 -f /tmp/osekola-exam-benchmark.sql -l --log-prefix=/tmp/osekola-exam-latency | tee /tmp/osekola-exam-summary.txt
docker exec "$POSTGRES_CONTAINER_ID" sh -c 'cat /tmp/osekola-exam-latency.*' > /tmp/osekola-exam-latency.txt
python3 - <<'PY'
import json, pathlib, re
summary=pathlib.Path('/tmp/osekola-exam-summary.txt').read_text()
assert re.search(r'number of transactions actually processed: [1-9]',summary), 'No successful exam transactions'
failed=re.search(r'number of failed transactions: (\d+)',summary)
assert failed is None or int(failed[1])==0, 'Exam transaction failure under load'
values=sorted(float(line.split()[2])/1000 for line in pathlib.Path('/tmp/osekola-exam-latency.txt').read_text().splitlines() if len(line.split())>=3)
assert values, 'Missing latency observations'
p95=values[min(len(values)-1,int(len(values)*.95))]
result={'environment':'disposable PostgreSQL CI; not production HTTP load','registered_students':2000,'active_virtual_students':1984,'database_clients':64,'transactions':len(values),'p95_ms':round(p95,2),'max_ms':round(values[-1],2)}
pathlib.Path('/tmp/osekola-exam-load.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
assert p95<1500, 'p95 exceeds isolated CI budget of 1.5 seconds'
PY
psql "$DATABASE_TEST_URL" -X -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select count(*) from public.school_exam_attempts where tenant_id='d5000000-0000-4000-8000-000000000001')<>2000 or not exists(select 1 from public.school_exam_attempts where tenant_id='d5000000-0000-4000-8000-000000000001' and revision>0) then raise exception 'Load fixtures or saved answers missing'; end if; end \$\$;"
