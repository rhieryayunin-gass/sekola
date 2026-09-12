#!/usr/bin/env bash
# Exercise real filesystem changes in a disposable container; service/probes are fakes.
set -euo pipefail
archive="${1:?Pass built API archive}"
source_sha="$(git rev-parse HEAD)"
archive_sha="$(sha256sum "$archive" | cut -d ' ' -f1)"
docker run --rm \
  -v "$archive:/input/api.tar.gz:ro" \
  -v "$PWD/ops/upgrade-osekola-api.sh:/upgrade.sh:ro" \
  -v "$(command -v node):/opt/osekola/runtime/node/bin/node:ro" \
  -e SOURCE_SHA="$source_sha" -e ARCHIVE_SHA="$archive_sha" \
  ubuntu:24.04 bash -euo pipefail -c '
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3
    export PREVIOUS_SHA=1111111111111111111111111111111111111111
    mkdir -p /etc/osekola /etc/systemd/system /opt/osekola/releases/$PREVIOUS_SHA /opt/riri /etc/riri-emerald
    printf "RELEASE_SHA=%s\n" "$PREVIOUS_SHA" > /opt/osekola/releases/$PREVIOUS_SHA/release.env
    ln -s /opt/osekola/releases/$PREVIOUS_SHA /opt/osekola/current
    printf "fixture-only-secret\n" > /etc/osekola/api.env
    chmod 600 /etc/osekola/api.env
    touch /etc/systemd/system/osekola-api.service /opt/riri/sentinel /etc/riri-emerald/sentinel
    cat > /usr/local/bin/systemctl <<'"'"'SH'"'"'
#!/bin/bash
if [[ "$*" == "is-active --quiet osekola-api" ]]; then exit 0; fi
[[ "$*" == "restart osekola-api" ]] || exit 9
echo "$*" >> /tmp/restarts
[[ ! -e /tmp/fail-new-start || "$(basename "$(readlink -f /opt/osekola/current)")" == "$PREVIOUS_SHA" ]]
SH
    cat > /usr/local/bin/curl <<'"'"'SH'"'"'
#!/bin/bash
release="$(basename "$(readlink -f /opt/osekola/current)")"
if [[ "${*: -1}" == */health ]]; then printf "{\"data\":{\"status\":\"ok\",\"release\":\"%s\"}}\n" "$release";
elif [[ "${*: -1}" == */ready ]]; then printf "{\"data\":{\"status\":\"ready\"}}\n";
else exit 9; fi
SH
    chmod +x /usr/local/bin/systemctl /usr/local/bin/curl
    before="$(sha256sum /etc/osekola/api.env /etc/systemd/system/osekola-api.service /opt/riri/sentinel /etc/riri-emerald/sentinel)"
    if bash /upgrade.sh /input/api.tar.gz "$SOURCE_SHA" "$(printf %064d 0)" > /tmp/checksum.log 2>&1; then exit 1; fi
    grep -q "Archive checksum mismatch" /tmp/checksum.log
    if bash /upgrade.sh /input/api.tar.gz "$(printf %040d 0)" "$ARCHIVE_SHA" > /tmp/source.log 2>&1; then exit 1; fi
    grep -q "Package source/platform/architecture mismatch" /tmp/source.log
    test ! -e /tmp/restarts
    test "$(readlink -f /opt/osekola/current)" = /opt/osekola/releases/$PREVIOUS_SHA
    bash /upgrade.sh /input/api.tar.gz "$SOURCE_SHA" "$ARCHIVE_SHA"
    test "$(readlink -f /opt/osekola/current)" = /opt/osekola/releases/$SOURCE_SHA
    test -f /opt/osekola/current/dist/main.js
    test "$(stat -c %u /opt/osekola/current/dist/main.js)" = 0
    test "$(wc -l < /tmp/restarts)" = 1
    if bash /upgrade.sh /input/api.tar.gz "$SOURCE_SHA" "$ARCHIVE_SHA" > /tmp/repeat.log 2>&1; then exit 1; fi
    grep -q "Release already exists" /tmp/repeat.log
    ln -s /opt/osekola/releases/$PREVIOUS_SHA /opt/osekola/previous
    mv -Tf /opt/osekola/previous /opt/osekola/current
    rm -rf /opt/osekola/releases/$SOURCE_SHA
    touch /tmp/fail-new-start
    if bash /upgrade.sh /input/api.tar.gz "$SOURCE_SHA" "$ARCHIVE_SHA" > /tmp/rollback.log 2>&1; then exit 1; fi
    grep -q "OSEKOLA_API_ROLLED_BACK" /tmp/rollback.log
    test "$(readlink -f /opt/osekola/current)" = /opt/osekola/releases/$PREVIOUS_SHA
    test -d /opt/osekola/releases/$SOURCE_SHA
    test "$(wc -l < /tmp/restarts)" = 3
    test "$before" = "$(sha256sum /etc/osekola/api.env /etc/systemd/system/osekola-api.service /opt/riri/sentinel /etc/riri-emerald/sentinel)"
    test "$(stat -c %a /etc/osekola/api.env)" = 600
    echo "Upgrade success, checksum/source rejection, repeat refusal, rollback and sibling/config preservation passed"
  '
