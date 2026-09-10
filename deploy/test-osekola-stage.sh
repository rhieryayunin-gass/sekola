#!/usr/bin/env bash
set -euo pipefail
archive="${1:?Pass built API archive}"
source_sha="$(git rev-parse HEAD)"
archive_sha="$(sha256sum "$archive" | cut -d ' ' -f1)"
docker run --rm \
  -v "$archive:/input/api.tar.gz:ro" \
  -v "$PWD/ops/stage-osekola-api.sh:/stage.sh:ro" \
  -v "$(command -v node):/opt/osekola/runtime/node/bin/node:ro" \
  -e SOURCE_SHA="$source_sha" -e ARCHIVE_SHA="$archive_sha" \
  ubuntu:24.04 bash -euo pipefail -c '
    apt-get update -qq
    apt-get install -y --no-install-recommends python3-minimal
    mkdir -p /etc/systemd/system
    if bash /stage.sh /input/api.tar.gz "$SOURCE_SHA" "$(printf %064d 0)"; then exit 1; fi
    if bash /stage.sh /input/api.tar.gz "$(printf %040d 0)" "$ARCHIVE_SHA"; then exit 1; fi
    test ! -e /opt/osekola/current
    test ! -e /etc/osekola/api.env
    bash /stage.sh /input/api.tar.gz "$SOURCE_SHA" "$ARCHIVE_SHA"
    test "$(stat -c %a /etc/osekola/api.env)" = 600
    test "$(stat -c %u /etc/osekola/api.env)" = 0
    test -f /opt/osekola/current/dist/main.js
    test -f /opt/osekola/current/node_modules/@nestjs/core/package.json
    test "$(id -u osekola)" != 0
    test ! -e /etc/systemd/system/multi-user.target.wants/osekola-api.service
    before="$(sha256sum /etc/osekola/api.env)"
    if bash /stage.sh /input/api.tar.gz "$SOURCE_SHA" "$ARCHIVE_SHA"; then exit 1; fi
    test "$before" = "$(sha256sum /etc/osekola/api.env)"
    echo "API staging, digest/source rejection, secret permissions and repeat refusal passed"
  '
