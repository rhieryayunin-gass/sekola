#!/usr/bin/env bash
set -euo pipefail
# This fixture runs only in a disposable container, with no production credentials.
docker run --rm -i -v "$PWD:/repo:ro" ubuntu:24.04 bash -euo pipefail <<'CONTAINER'
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx curl ca-certificates openssl python3
mkdir -p /opt/osekola /etc/letsencrypt/live/api.osekola.com
cat > /usr/bin/systemctl <<'SHIM'
#!/bin/sh
case "$1" in
  is-active) test -s /run/nginx.pid ;;
  reload)
    if [ -e /tmp/fail-reload ]; then rm /tmp/fail-reload; exit 1; fi
    nginx -s reload || exit 1
    echo reload >> /tmp/reloads
    if [ -e /tmp/fail-probe ]; then rm /tmp/fail-probe; touch /tmp/api-unhealthy; fi ;;
  *) exit 1 ;;
esac
SHIM
chmod 0755 /usr/bin/systemctl
printf 'server { listen 80; server_name riri.test; return 200 riri-ok; }\n' > /etc/nginx/sites-available/riri
ln -s /etc/nginx/sites-available/riri /etc/nginx/sites-enabled/riri
nginx
bash /repo/ops/bootstrap-osekola-nginx.sh /repo/deploy/osekola/nginx-bootstrap.conf
if bash /repo/ops/activate-osekola-tls.sh /repo/deploy/osekola/nginx-api.conf > /tmp/missing.log 2>&1; then exit 1; fi
grep -q 'certificate first' /tmp/missing.log
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=api.osekola.com' \
  -addext 'subjectAltName=DNS:api.osekola.com,DNS:riri.test' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -keyout /etc/letsencrypt/live/api.osekola.com/privkey.pem \
  -out /etc/letsencrypt/live/api.osekola.com/fullchain.pem 2>/dev/null
cp /etc/letsencrypt/live/api.osekola.com/fullchain.pem /usr/local/share/ca-certificates/osekola-fixture.crt
update-ca-certificates
cat >> /etc/nginx/sites-available/riri <<'NGINX'
server {
  listen 443 ssl;
  server_name riri.test;
  ssl_certificate /etc/letsencrypt/live/api.osekola.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.osekola.com/privkey.pem;
  return 200 riri-ok;
}
NGINX
nginx -t
nginx -s reload
sha256sum /etc/nginx/sites-available/riri > /tmp/riri.sha256
sha256sum /etc/nginx/sites-available/osekola-api > /tmp/bootstrap.sha256
cat > /tmp/api.py <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        bad = self.path.endswith('/ready') and Path('/tmp/api-unhealthy').exists()
        data = {'status': 'ready'} if self.path.endswith('/ready') else {'status': 'ok', 'service': 'sekola-api', 'release': '1' * 40}
        self.send_response(503 if bad else 200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'success': not bad, 'data': data}).encode())
    def log_message(self, *args): pass
HTTPServer(('127.0.0.1', 3020), Handler).serve_forever()
PY
python3 /tmp/api.py &
curl -fsS --retry 5 --retry-connrefused --retry-delay 1 http://127.0.0.1:3020/api/v1/health
printf wrong > /tmp/wrong.conf
if bash /repo/ops/activate-osekola-tls.sh /tmp/wrong.conf > /tmp/wrong.log 2>&1; then exit 1; fi
grep -q 'Template checksum mismatch' /tmp/wrong.log
hook=/etc/letsencrypt/renewal-hooks/deploy/50-osekola-nginx-reload
mkdir -p "$(dirname "$hook")"
printf existing > "$hook"
if bash /repo/ops/activate-osekola-tls.sh /repo/deploy/osekola/nginx-api.conf > /tmp/hook.log 2>&1; then exit 1; fi
grep -q 'Existing renewal hook' /tmp/hook.log
test "$(cat "$hook")" = existing
rm "$hook"
for failure in fail-reload fail-probe; do
  touch "/tmp/$failure"
  if bash /repo/ops/activate-osekola-tls.sh /repo/deploy/osekola/nginx-api.conf > /tmp/failure.log 2>&1; then exit 1; fi
  cat /tmp/failure.log
  grep -q 'OSEKOLA_TLS_ROLLBACK: HTTP bootstrap restored' /tmp/failure.log
  sha256sum -c /tmp/bootstrap.sha256
  test ! -e "$hook"
  rm -f /tmp/api-unhealthy
done
bash /repo/ops/activate-osekola-tls.sh /repo/deploy/osekola/nginx-api.conf
test "$(stat -c %u:%a "$hook")" = 0:755
test "$(stat -c %u:%a /etc/nginx/sites-available/osekola-api)" = 0:644
curl --noproxy '*' -fsS --resolve api.osekola.com:443:127.0.0.1 https://api.osekola.com/api/v1/ready
test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: api.osekola.com' http://127.0.0.1/)" = 301
printf acme-ok > /var/www/osekola-acme/.well-known/acme-challenge/tls-fixture
test "$(curl -fsS -H 'Host: api.osekola.com' http://127.0.0.1/.well-known/acme-challenge/tls-fixture)" = acme-ok
test "$(curl -fsS -H 'Host: riri.test' http://127.0.0.1/)" = riri-ok
test "$(curl --noproxy '*' -fsS --resolve riri.test:443:127.0.0.1 https://riri.test/)" = riri-ok
sha256sum -c /tmp/riri.sha256
before="$(wc -l < /tmp/reloads)"
RENEWED_LINEAGE=/etc/letsencrypt/live/riri.test "$hook"
test "$(wc -l < /tmp/reloads)" = "$before"
RENEWED_LINEAGE=/etc/letsencrypt/live/api.osekola.com "$hook"
test "$(wc -l < /tmp/reloads)" = "$((before + 1))"
printf invalid > /etc/nginx/sites-enabled/invalid-fixture
if RENEWED_LINEAGE=/etc/letsencrypt/live/api.osekola.com "$hook"; then exit 1; fi
test "$(wc -l < /tmp/reloads)" = "$((before + 1))"
rm /etc/nginx/sites-enabled/invalid-fixture
if bash /repo/ops/activate-osekola-tls.sh /repo/deploy/osekola/nginx-api.conf > /tmp/repeat.log 2>&1; then exit 1; fi
grep -q 'not the reviewed HTTP bootstrap' /tmp/repeat.log
echo 'HTTPS, API release, ACME, rollback, sibling preservation and scoped renewal hook checks passed'
CONTAINER
