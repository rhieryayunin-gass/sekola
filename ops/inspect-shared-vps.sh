#!/usr/bin/env bash
# Read-only inventory: no installs, reloads, restarts, config dumps or secret reads.
set -uo pipefail
printf 'HOST: '; hostname
printf 'USER: '; id -un
printf 'TIME: '; date -u +%FT%TZ
printf '\nCAPACITY\n'
printf 'ARCH: '; uname -m
printf 'CPU_COUNT: '; nproc
uptime
free -m
df -h / /opt 2>/dev/null
printf '\nRUNTIME\n'
for tool in node nginx certbot; do
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    case "$tool" in nginx) nginx -v 2>&1 ;; *) "$tool" --version 2>&1 ;; esac
  else printf '%s: MISSING\n' "$tool"; fi
done
if [[ -x /opt/osekola/runtime/node/bin/node ]]; then
  printf 'OSEKOLA_NODE: '; /opt/osekola/runtime/node/bin/node --version
else
  echo 'OSEKOLA_NODE: not installed'
fi
printf '\nSERVICE STATE\n'
for service in riri-api riri-emerald-api nginx osekola-api; do
  printf '%s: ' "$service"
  systemctl is-active "$service" 2>/dev/null || true
done
printf '\nLISTENING TCP PORTS (no process arguments)\n'
if ! command -v ss >/dev/null 2>&1; then echo 'PORT_CHECK: unavailable'; exit 1; fi
if ! listeners="$(ss -H -ltn)"; then echo 'PORT_CHECK: failed'; exit 1; fi
printf '%s\n' "$listeners"
if awk '{print $4}' <<< "$listeners" | grep -Eq '(^|:)3020$'; then
  echo 'PORT_3020: occupied; do not deploy until the owner is identified'
else
  echo 'PORT_3020: free at inspection time'
fi
printf '\nOSEKOLA PATH PRESENCE (no file contents)\n'
for target in /opt/osekola /etc/osekola /etc/nginx/sites-enabled/osekola-api; do
  if [[ -e "$target" || -L "$target" ]]; then printf '%s: exists\n' "$target"; else printf '%s: absent\n' "$target"; fi
done
echo 'Inspection only: availability and capacity still require review before deployment.'
