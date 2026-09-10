#!/usr/bin/env bash
set -euo pipefail
# Root filesystem mutations are confined to a disposable Ubuntu container.
docker run --rm -v "$PWD/ops/install-osekola-node.sh:/install-node.sh:ro" ubuntu:24.04 bash -euo pipefail -c '
  apt-get update -qq
  apt-get install -y --no-install-recommends ca-certificates curl xz-utils
  mkdir /tmp/fake-bin
  cat > /tmp/fake-bin/curl <<"FAKE"
#!/usr/bin/env bash
output="${!#}"
if [[ "$output" == SHASUMS256.txt ]]; then
  printf "%064d  node-v22.23.2-linux-x64.tar.xz\n" 0 > "$output"
else
  printf "invalid archive\n" > "$output"
fi
FAKE
  chmod +x /tmp/fake-bin/curl
  if PATH="/tmp/fake-bin:$PATH" bash /install-node.sh > /tmp/checksum.log 2>&1; then
    echo "Bad checksum was accepted" >&2; exit 1
  fi
  grep -q "FAILED" /tmp/checksum.log
  test ! -e /opt/osekola/runtime/node
  bash /install-node.sh
  test "$(/opt/osekola/runtime/node/bin/node --version)" = v22.23.2
  before="$(sha256sum /opt/osekola/runtime/node/bin/node)"
  bash /install-node.sh
  test "$before" = "$(sha256sum /opt/osekola/runtime/node/bin/node)"
  test ! -e /usr/bin/node
  test ! -e /usr/local/bin/node
  echo "Isolated Node installation, checksum rejection and repeat execution passed"
'
