#!/usr/bin/env bash
set -euo pipefail
config_temp="$(mktemp -d)"
trap 'rm -rf "$config_temp"' EXIT
mkdir -p "$config_temp/certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=api.osekola.com' \
  -keyout "$config_temp/certs/privkey.pem" -out "$config_temp/certs/fullchain.pem" 2>/dev/null
for config in nginx-bootstrap.conf nginx-api.conf; do
  docker run --rm -v "$PWD/deploy/osekola/$config:/etc/nginx/conf.d/default.conf:ro" \
    -v "$config_temp/certs:/etc/letsencrypt/live/api.osekola.com:ro" nginx:stable-alpine nginx -t
done
# CI's Node binary may live in a tool cache. Validate the unit with that
# executable; the isolated runtime path is checked on the actual VPS.
node_binary="$(command -v node)"
sed "s|^ExecStart=/opt/osekola/runtime/node/bin/node |ExecStart=$node_binary |" \
  deploy/osekola/osekola-api.service > "$config_temp/osekola-api.service"
systemd-analyze verify "$config_temp/osekola-api.service"
