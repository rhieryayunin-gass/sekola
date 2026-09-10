#!/usr/bin/env bash
set -euo pipefail
docker run --rm -v "$PWD:/repo:ro" ubuntu:24.04 bash -euo pipefail -c '
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx curl ca-certificates python3
  mkdir -p /opt/osekola /usr/local/bin
  # Disposable container shim: exercise the real Nginx daemon and HUP reload.
  printf "#!/bin/sh\ncase \"\$1\" in\nis-active) test -s /run/nginx.pid ;;\nreload) nginx -s reload ;;\n*) exit 1 ;;\nesac\n" > /usr/local/bin/systemctl
  chmod 0755 /usr/local/bin/systemctl
  printf "server { listen 80; server_name riri.test; location / { return 200 riri-ok; } }\n" > /etc/nginx/sites-available/riri
  ln -s /etc/nginx/sites-available/riri /etc/nginx/sites-enabled/riri
  nginx
  sha256sum /etc/nginx/sites-available/riri > /tmp/riri.sha256

  printf wrong > /tmp/wrong.conf
  if bash /repo/ops/bootstrap-osekola-nginx.sh /tmp/wrong.conf > /tmp/wrong.log 2>&1; then exit 1; fi
  grep -q "Template checksum mismatch" /tmp/wrong.log
  test ! -e /etc/nginx/sites-enabled/osekola-api

  printf "server { listen 80; server_name\n \"api.osekola.com\"; return 503; }\n" > /etc/nginx/sites-enabled/conflict
  if bash /repo/ops/bootstrap-osekola-nginx.sh /repo/deploy/osekola/nginx-bootstrap.conf > /tmp/conflict.log 2>&1; then exit 1; fi
  grep -q "already appears" /tmp/conflict.log
  rm /etc/nginx/sites-enabled/conflict

  # A failed first reload must restore the prior files and running sibling vhost.
  cp /usr/local/bin/systemctl /tmp/systemctl.good
  printf "#!/bin/sh\nif [ \"\$1\" = reload ] && [ ! -e /tmp/reload-failed ]; then touch /tmp/reload-failed; exit 1; fi\nexec /tmp/systemctl.good \"\$@\"\n" > /usr/local/bin/systemctl
  if bash /repo/ops/bootstrap-osekola-nginx.sh /repo/deploy/osekola/nginx-bootstrap.conf; then exit 1; fi
  test ! -e /etc/nginx/sites-available/osekola-api
  test ! -L /etc/nginx/sites-enabled/osekola-api
  cp /tmp/systemctl.good /usr/local/bin/systemctl

  bash /repo/ops/bootstrap-osekola-nginx.sh /repo/deploy/osekola/nginx-bootstrap.conf
  test "$(curl -fsS -H "Host: riri.test" http://127.0.0.1/)" = riri-ok
  test "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: api.osekola.com" http://127.0.0.1/)" = 503
  sha256sum -c /tmp/riri.sha256
  test "$(stat -c %a /etc/nginx/sites-available/osekola-api)" = 644
  test -L /etc/nginx/sites-enabled/osekola-api
  if bash /repo/ops/bootstrap-osekola-nginx.sh /repo/deploy/osekola/nginx-bootstrap.conf > /tmp/repeat.log 2>&1; then exit 1; fi
  grep -q "Existing configuration needs review" /tmp/repeat.log
  echo "Nginx ACME route, checksum/conflict/repeat rejection, rollback and sibling preservation passed"
'
