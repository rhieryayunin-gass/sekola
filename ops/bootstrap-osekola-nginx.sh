#!/usr/bin/env bash
# First-install HTTP/ACME vhost only. No certificate request or API restart.
set -euo pipefail
fail() { echo "OSEKOLA_NGINX_STOPPED: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run with sudo bash.'
template="${1:?Pass the reviewed nginx-bootstrap.conf file}"
for tool in nginx systemctl curl sha256sum stat flock install python3; do
  command -v "$tool" >/dev/null || fail "Missing prerequisite: $tool"
done
safe_dir() {
  [[ -d "$1" && ! -L "$1" ]] || fail "Expected real directory: $1"
  [[ $(stat -c %u "$1") == 0 ]] || fail "Expected root ownership: $1"
  local mode
  mode="$(stat -c %a "$1")"
  (( (8#$mode & 0022) == 0 )) || fail "Directory is writable by other users: $1"
}
for dir in /opt /opt/osekola /etc /etc/nginx /etc/nginx/sites-available /etc/nginx/sites-enabled /var /var/www; do
  safe_dir "$dir"
done
lock=/opt/osekola/.nginx-bootstrap.lock
[[ ! -L "$lock" ]] || fail 'Unexpected lock symlink.'
exec 9>"$lock"
flock -n 9 || fail 'Another osekola Nginx setup is running.'
available=/etc/nginx/sites-available/osekola-api
enabled=/etc/nginx/sites-enabled/osekola-api
for path in "$available" "$enabled"; do
  [[ ! -e "$path" && ! -L "$path" ]] || fail "Existing configuration needs review: $path"
done
systemctl is-active --quiet nginx || fail 'Nginx must already be running.'
nginx -t
# Read the active config only to detect a duplicate hostname; never print it.
python3 - <<'PY'
import re
import subprocess
import sys
result = subprocess.run(['nginx', '-T'], capture_output=True, text=True)
if result.returncode:
    sys.exit('OSEKOLA_NGINX_STOPPED: Cannot inspect active Nginx configuration.')
text = re.sub(r'(?m)#.*$', '', result.stdout)
for directive in re.findall(r'\bserver_name\s+([^;]+);', text):
    names = [name.strip('\"\'').lower() for name in directive.split()]
    if 'api.osekola.com' in names:
        sys.exit('OSEKOLA_NGINX_STOPPED: api.osekola.com already appears in the active Nginx configuration.')
PY
stage="$(mktemp -d)"
changed=0
committed=0
probe=''
cleanup() {
  local result=$?
  trap - EXIT
  if (( changed && ! committed )); then
    rm -f "$enabled" "$available"
    if ! nginx -t || ! systemctl reload nginx; then
      echo 'OSEKOLA_NGINX_ROLLBACK: previous files restored; verify Nginx reload manually.' >&2
    fi
  fi
  [[ -z "$probe" ]] || rm -f "$probe"
  rm -rf "$stage"
  exit "$result"
}
trap cleanup EXIT
install -m 0644 "$template" "$stage/http.conf"
printf '%s  %s\n' c2f4e06f78bd5376a9683450761ae0b6de97bf1c613c979383068a71b29995d3 "$stage/http.conf" | sha256sum -c - >/dev/null || fail 'Template checksum mismatch.'
for dir in /var/www/osekola-acme /var/www/osekola-acme/.well-known /var/www/osekola-acme/.well-known/acme-challenge; do
  if [[ ! -e "$dir" && ! -L "$dir" ]]; then install -d -m 0755 "$dir"; fi
  safe_dir "$dir"
done
probe="$(mktemp /var/www/osekola-acme/.well-known/acme-challenge/osekola-XXXXXXXX)"
printf '%s' OSEKOLA_ACME_OK > "$probe"
chmod 0644 "$probe"
changed=1
install -m 0644 "$stage/http.conf" "$available"
ln -s "$available" "$enabled"
nginx -t
systemctl reload nginx
curl --noproxy '*' -fsS --retry 5 --retry-all-errors --retry-delay 1 --retry-max-time 10 --max-time 3 \
  -H 'Host: api.osekola.com' "http://127.0.0.1/.well-known/acme-challenge/${probe##*/}" > "$stage/probe"
[[ $(cat "$stage/probe") == OSEKOLA_ACME_OK ]] || fail 'ACME location did not return the expected local probe.'
committed=1
echo 'OSEKOLA_NGINX_HTTP_READY'
echo 'Local ACME route verified. API traffic returns HTTP 503 until TLS is installed.'
echo 'Public DNS, certificate issuance and renewal still require verification.'
