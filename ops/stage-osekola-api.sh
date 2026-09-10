#!/usr/bin/env bash
# Stage a reviewed first release. This does not start/reload any service.
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash' >&2; exit 1; }
archive="${1:?Pass API archive path}"
source_sha="${2:?Pass reviewed source SHA}"
archive_sha="${3:?Pass independently verified archive SHA-256}"
[[ "$source_sha" =~ ^[a-f0-9]{40}$ && "$archive_sha" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid source or archive digest' >&2; exit 1; }
[[ -f "$archive" && ! -L "$archive" ]] || { echo 'Archive must be a regular file' >&2; exit 1; }
for tool in python3 sha256sum flock stat getent useradd install; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
archive="$(realpath "$archive")"
node_binary=/opt/osekola/runtime/node/bin/node
[[ -x "$node_binary" ]] || { echo 'Install the isolated osekola Node runtime first' >&2; exit 1; }
[[ "$("$node_binary" -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Node.js 22 is required' >&2; exit 1; }
runtime_arch="$("$node_binary" -p process.arch)"
[[ "$(sha256sum "$archive" | cut -d ' ' -f1)" == "$archive_sha" ]] || { echo 'Archive checksum mismatch' >&2; exit 1; }

for directory in /opt /opt/osekola /opt/osekola/releases /etc /etc/osekola; do
  [[ ! -L "$directory" ]] || { echo "Refusing symlink directory: $directory" >&2; exit 1; }
  if [[ ! -e "$directory" ]]; then install -d -o root -g root -m 0755 "$directory"; fi
  [[ -d "$directory" && "$(stat -c %u "$directory")" == 0 ]] || { echo "Require root-owned directory: $directory" >&2; exit 1; }
  directory_mode="$(stat -c %a "$directory")"
  (( (8#$directory_mode & 0022) == 0 )) || { echo "Directory is writable by others: $directory" >&2; exit 1; }
done
exec 9>/opt/osekola/.stage.lock
flock -n 9 || { echo 'Another staging operation is running' >&2; exit 1; }
release_dir="/opt/osekola/releases/$source_sha"
if command -v systemctl >/dev/null && systemctl is-active --quiet osekola-api; then
  echo 'An active osekola API needs the upgrade procedure' >&2; exit 1
fi
for target in "$release_dir" /opt/osekola/current /etc/osekola/api.env /etc/systemd/system/osekola-api.service; do
  [[ ! -e "$target" && ! -L "$target" ]] || { echo "Existing installation needs review: $target" >&2; exit 1; }
done
stage_temp="$(mktemp -d /opt/osekola/releases/.stage.XXXXXX)"
trap 'rm -rf "$stage_temp"' EXIT
# Python's data filter rejects escaping links and special files. Validate
# metadata before publishing the root-owned release or creating an account.
python3 - "$archive" "$source_sha" "$runtime_arch" "$stage_temp" <<'PY'
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
if getent passwd osekola >/dev/null; then
  echo 'Existing osekola account needs review before first installation' >&2
  exit 1
fi
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin osekola
chmod 0755 "$stage_temp"
mv -T "$stage_temp" "$release_dir"
install -o root -g root -m 0600 "$release_dir/deploy/api.env.example" /etc/osekola/api.env
install -o root -g root -m 0644 "$release_dir/deploy/osekola-api.service" /etc/systemd/system/osekola-api.service
ln -s "$release_dir" /opt/osekola/current
echo "OSEKOLA_API_STAGED: $source_sha"
echo 'Fill production SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY using sudoedit /etc/osekola/api.env.'
echo 'No service was started. Review configuration and refresh port/capacity checks before activation.'
