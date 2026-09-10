#!/usr/bin/env bash
# Promote the reviewed HTTP bootstrap to HTTPS after Certbot has issued the cert.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
fail() { echo "OSEKOLA_TLS_STOPPED: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run with sudo bash.'
template="${1:?Pass the reviewed nginx-api.conf file}"
for tool in nginx systemctl curl openssl python3 sha256sum stat flock install; do
  command -v "$tool" >/dev/null || fail "Missing prerequisite: $tool"
done
safe_dir() {
  [[ -d "$1" && ! -L "$1" ]] || fail "Expected real directory: $1"
  [[ $(stat -c %u "$1") == 0 ]] || fail "Expected root ownership: $1"
  local mode
  mode="$(stat -c %a "$1")"
  (( (8#$mode & 0022) == 0 )) || fail "Directory is writable by other users: $1"
}
for dir in /opt /opt/osekola /etc /etc/nginx /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/letsencrypt; do
  safe_dir "$dir"
done
lock=/opt/osekola/.nginx-bootstrap.lock
[[ ! -L "$lock" ]] || fail 'Unexpected lock symlink.'
exec 9>"$lock"
flock -n 9 || fail 'Another osekola Nginx setup is running.'
available=/etc/nginx/sites-available/osekola-api
enabled=/etc/nginx/sites-enabled/osekola-api
hook=/etc/letsencrypt/renewal-hooks/deploy/50-osekola-nginx-reload
[[ -f "$available" && ! -L "$available" ]] || fail 'Expected the installed HTTP bootstrap file.'
[[ -L "$enabled" && $(readlink -f "$enabled") == "$available" ]] || fail 'Unexpected enabled vhost link.'
[[ $(sha256sum "$available" | cut -d ' ' -f 1) == c2f4e06f78bd5376a9683450761ae0b6de97bf1c613c979383068a71b29995d3 ]] || fail 'Existing vhost is not the reviewed HTTP bootstrap; review it before replacing it.'
[[ ! -e "$hook" && ! -L "$hook" ]] || fail "Existing renewal hook needs review: $hook"
for service in nginx osekola-api riri-api riri-emerald-api; do
  systemctl is-active --quiet "$service" || fail "Service is not active: $service"
done
nginx -t
cert=/etc/letsencrypt/live/api.osekola.com/fullchain.pem
[[ -s "$cert" && -s /etc/letsencrypt/live/api.osekola.com/privkey.pem ]] || fail 'Issue the api.osekola.com certificate first.'
openssl x509 -in "$cert" -noout -checkend 86400 || fail 'Certificate expires within one day.'
openssl verify -CApath /etc/ssl/certs -untrusted "$cert" -verify_hostname api.osekola.com "$cert" || fail 'Certificate trust or hostname verification failed.'

stage="$(mktemp -d /etc/nginx/sites-available/.osekola-tls-XXXXXXXX)"
changed=0
hook_changed=0
committed=0
backup=''
cleanup() {
  local result=$?
  trap - EXIT
  if (( changed && ! committed )); then
    if cp -p "$backup/http.conf" "$stage/restore.conf" && mv -f "$stage/restore.conf" "$available" && nginx -t && systemctl reload nginx; then
      echo "OSEKOLA_TLS_ROLLBACK: HTTP bootstrap restored; backup: $backup"
    else
      echo "OSEKOLA_TLS_ROLLBACK_FAILED: inspect Nginx and restore $backup/http.conf manually." >&2
    fi
  fi
  if (( hook_changed && ! committed )); then rm -f "$hook"; fi
  rm -rf "$stage"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
install -m 0644 "$template" "$stage/https.conf"
printf '%s  %s\n' 603d086b5fff189d45bc809e40f891f05862cb1874593fd39733ae818866a29f "$stage/https.conf" | sha256sum -c - >/dev/null || fail 'Template checksum mismatch.'
curl --noproxy '*' -fsS --max-time 5 http://127.0.0.1:3020/api/v1/health > "$stage/baseline.json"
python3 - "$stage/baseline.json" <<'PY'
import json, re, sys
value = json.load(open(sys.argv[1]))
data = value.get('data', {})
if not (value.get('success') is True and data.get('status') == 'ok' and data.get('service') == 'sekola-api' and re.fullmatch('[0-9a-f]{40}', data.get('release', ''))):
    sys.exit('OSEKOLA_TLS_STOPPED: Unexpected local API health or release.')
PY
for dir in /opt/osekola/nginx-backups /etc/letsencrypt/renewal-hooks /etc/letsencrypt/renewal-hooks/deploy; do
  if [[ ! -e "$dir" && ! -L "$dir" ]]; then install -d -m 0755 "$dir"; fi
  safe_dir "$dir"
done
backup="$(mktemp -d /opt/osekola/nginx-backups/tls-XXXXXXXX)"
cp -p "$available" "$backup/http.conf"
cat > "$stage/renew-hook" <<'HOOK'
#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/api.osekola.com ] || exit 0
nginx -t
systemctl reload nginx
HOOK
changed=1
mv -f "$stage/https.conf" "$available"
nginx -t
systemctl reload nginx
verified=0
# Old workers can briefly answer during graceful reload; retry semantic checks too.
for attempt in {1..6}; do
  if curl --noproxy '*' -fsS --max-time 3 --resolve api.osekola.com:443:127.0.0.1 \
      https://api.osekola.com/api/v1/health > "$stage/health.json" &&
    curl --noproxy '*' -fsS --max-time 3 --resolve api.osekola.com:443:127.0.0.1 \
      https://api.osekola.com/api/v1/ready > "$stage/ready.json" &&
    python3 - "$stage" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
try:
    baseline, health, ready = [json.loads((root / f'{name}.json').read_text()) for name in ('baseline', 'health', 'ready')]
except ValueError:
    sys.exit('HTTPS probe did not return JSON yet.')
if not (health.get('success') is True and health.get('data', {}).get('status') == 'ok' and health.get('data', {}).get('service') == 'sekola-api' and health.get('data', {}).get('release') == baseline['data']['release'] and ready.get('success') is True and ready.get('data', {}).get('status') == 'ready'):
    sys.exit('HTTPS health, readiness or release verification failed.')
PY
  then
    verified=1
    break
  fi
  if (( attempt < 6 )); then sleep 1; fi
done
(( verified )) || fail 'HTTPS probes did not pass; restoring HTTP bootstrap.'
for service in nginx osekola-api riri-api riri-emerald-api; do
  systemctl is-active --quiet "$service" || fail "Service became inactive: $service"
done
hook_changed=1
install -o root -g root -m 0755 "$stage/renew-hook" "$hook"
committed=1
echo 'OSEKOLA_TLS_READY'
echo "Verified local HTTPS health/readiness and unchanged API release; HTTP backup: $backup/http.conf"
echo 'Scoped renewal hook installed. Public HTTPS, renewal dry-run and full sibling/application health still require verification.'
