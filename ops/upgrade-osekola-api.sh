#!/usr/bin/env bash
# Upgrade only the existing OSEKOLA API; retain and restore the prior release on failure.
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash' >&2; exit 1; }
archive="${1:?Pass API archive path}"
source_sha="${2:?Pass reviewed source SHA}"
archive_sha="${3:?Pass independently verified archive SHA-256}"
[[ "$source_sha" =~ ^[a-f0-9]{40}$ && "$archive_sha" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid source or archive digest' >&2; exit 1; }
[[ -f "$archive" && ! -L "$archive" ]] || { echo 'Archive must be a regular file' >&2; exit 1; }
for tool in python3 sha256sum flock stat systemctl curl install readlink cp mv ln; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
python3 -c 'import tarfile; assert hasattr(tarfile, "data_filter")' >/dev/null
for directory in /opt /opt/osekola /opt/osekola/releases /etc /etc/osekola; do
  [[ -d "$directory" && ! -L "$directory" && "$(stat -c %u "$directory")" == 0 ]] || { echo "Require existing root-owned directory: $directory" >&2; exit 1; }
  mode="$(stat -c %a "$directory")"
  (( (8#$mode & 0022) == 0 )) || { echo "Directory is writable by others: $directory" >&2; exit 1; }
done
for file in /etc/osekola/api.env /etc/systemd/system/osekola-api.service; do
  [[ -f "$file" && ! -L "$file" && "$(stat -c %u "$file")" == 0 ]] || { echo 'Existing API configuration required' >&2; exit 1; }
  mode="$(stat -c %a "$file")"
  (( (8#$mode & 0022) == 0 )) || { echo 'API configuration is writable by others' >&2; exit 1; }
done
node_binary=/opt/osekola/runtime/node/bin/node
[[ -x "$node_binary" && "$("$node_binary" -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Existing isolated Node.js 22 runtime required' >&2; exit 1; }
runtime_arch="$("$node_binary" -p process.arch)"
exec 9>/opt/osekola/.stage.lock
flock -n 9 || { echo 'Another OSEKOLA staging/upgrade operation is running' >&2; exit 1; }
[[ -L /opt/osekola/current ]] || { echo 'Existing release symlink required' >&2; exit 1; }
previous="$(readlink -f /opt/osekola/current)"
previous_sha="${previous##*/}"
[[ "$previous_sha" =~ ^[a-f0-9]{40}$ && "$previous" == "/opt/osekola/releases/$previous_sha" && -d "$previous" && ! -L "$previous" ]] || { echo 'Unexpected previous release path' >&2; exit 1; }
[[ "$(stat -c %u "$previous")" == 0 ]] || { echo 'Previous release must be root-owned' >&2; exit 1; }
mode="$(stat -c %a "$previous")"
(( (8#$mode & 0022) == 0 )) || { echo 'Previous release is writable by others' >&2; exit 1; }
[[ "$(cat "$previous/release.env")" == "RELEASE_SHA=$previous_sha" ]] || { echo 'Previous release metadata mismatch' >&2; exit 1; }
systemctl is-active --quiet osekola-api || { echo 'Existing API is not active; diagnose before upgrading' >&2; exit 1; }
release_dir="/opt/osekola/releases/$source_sha"
[[ ! -e "$release_dir" && ! -L "$release_dir" ]] || { echo 'Release already exists; review before reusing it' >&2; exit 1; }
upgrade_temp="$(mktemp -d /opt/osekola/releases/.upgrade.XXXXXX)"
next_link="/opt/osekola/.current-upgrade-$$"
switched=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [[ "$switched" == 1 ]]; then
    echo "Upgrade failed; restoring previous release $previous_sha" >&2
    rm -f "$next_link"
    if ln -s "$previous" "$next_link" && mv -Tf "$next_link" /opt/osekola/current && systemctl restart osekola-api && wait_release "$previous_sha"; then
      echo "OSEKOLA_API_ROLLED_BACK: $previous_sha" >&2
    else
      echo 'Rollback health could not be verified; operator intervention required' >&2
    fi
    result=1
  fi
  rm -f "$next_link"
  rm -rf "$upgrade_temp"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
check_release() {
  local expected="$1"
  curl -fsS --max-time 3 http://127.0.0.1:3020/api/v1/health | python3 -c 'import json,sys; d=json.load(sys.stdin); d=d.get("data",d); assert d.get("status")=="ok" and d.get("release")==sys.argv[1]' "$expected" 2>/dev/null &&
  curl -fsS --max-time 3 http://127.0.0.1:3020/api/v1/ready | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("data",d).get("status")=="ready"' 2>/dev/null
}
wait_release() {
  local expected="$1" attempt
  for attempt in {1..20}; do
    if check_release "$expected"; then return 0; fi
    sleep 1
  done
  return 1
}
check_release "$previous_sha" || { echo 'Previous API health/readiness is not valid' >&2; exit 1; }
# Copy into a root-only directory before verifying to prevent archive replacement.
cp -- "$archive" "$upgrade_temp/api.tar.gz"
[[ "$(sha256sum "$upgrade_temp/api.tar.gz" | cut -d ' ' -f1)" == "$archive_sha" ]] || { echo 'Archive checksum mismatch' >&2; exit 1; }
install -d -m 0755 "$upgrade_temp/release"
python3 - "$upgrade_temp/api.tar.gz" "$source_sha" "$runtime_arch" "$upgrade_temp/release" <<'PY'
import json, pathlib, sys, tarfile
archive, release, arch, destination = sys.argv[1:]
with tarfile.open(archive, 'r:gz') as bundle:
    members = bundle.getmembers()
    seen = set()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or path in seen:
            raise SystemExit('Unsafe archive path')
        seen.add(path)
    def read_file(name):
        member = next((m for m in members if m.name in (name, './' + name)), None)
        if member is None or not member.isfile() or member.size > 65536:
            raise SystemExit('Missing or invalid package metadata')
        return bundle.extractfile(member).read().decode()
    metadata = json.loads(read_file('package-meta.json'))
    if metadata.get('release') != release or metadata.get('platform') != 'linux' or metadata.get('arch') != arch:
        raise SystemExit('Package source/platform/architecture mismatch')
    if not str(metadata.get('node', '')).startswith('v22.'):
        raise SystemExit('Package requires a different Node major version')
    if read_file('release.env') != 'RELEASE_SHA=' + release + '\n':
        raise SystemExit('Package release identity mismatch')
    bundle.extractall(destination, filter='data')
root = pathlib.Path(destination)
for name in ('dist/main.js', 'deploy/api.env.example', 'deploy/osekola-api.service'):
    path = root / name
    if path.is_symlink() or not path.is_file():
        raise SystemExit('Incomplete API package')
if not (root / 'node_modules').is_dir():
    raise SystemExit('Missing production dependencies')
PY
chmod 0755 "$upgrade_temp/release"
mv -T "$upgrade_temp/release" "$release_dir"
ln -s "$release_dir" "$next_link"
switched=1
mv -Tf "$next_link" /opt/osekola/current
systemctl restart osekola-api
wait_release "$source_sha" || { echo 'New API health/readiness failed' >&2; exit 1; }
switched=0
echo "OSEKOLA_API_UPGRADED: $source_sha"
echo "Previous release retained: $previous_sha"
echo 'Verify public API health and OWNER capabilities before closing the release.'
