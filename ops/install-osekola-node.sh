#!/usr/bin/env bash
# First-install only. No global runtime, apt changes, service or Nginx operations.
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash' >&2; exit 1; }
[[ "$(uname -s)" == Linux ]] || { echo 'Linux is required' >&2; exit 1; }
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  *) echo 'Supported architectures: x86_64 and arm64' >&2; exit 1 ;;
esac
for tool in curl tar xz sha256sum flock stat; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done

# Pin the release; updates require a reviewed change and separate promotion.
node_version=22.23.2
node_name="node-v${node_version}-linux-${node_arch}"
runtime_root=/opt/osekola/runtime
node_target="$runtime_root/$node_name"
node_link="$runtime_root/node"
for directory in /opt /opt/osekola "$runtime_root"; do
  [[ ! -L "$directory" ]] || { echo "Refusing symlink directory: $directory" >&2; exit 1; }
  if [[ ! -e "$directory" ]]; then install -d -o root -g root -m 0755 "$directory"; fi
  [[ -d "$directory" && "$(stat -c %u "$directory")" == 0 ]] || { echo "Require root-owned directory: $directory" >&2; exit 1; }
  directory_mode="$(stat -c %a "$directory")"
  (( (8#$directory_mode & 0022) == 0 )) || { echo "Directory is writable by others: $directory" >&2; exit 1; }
done
exec 9>"$runtime_root/.install.lock"
flock -n 9 || { echo 'Another runtime installation is running' >&2; exit 1; }

if [[ -e "$node_link" || -L "$node_link" ]]; then
  if [[ -L "$node_link" && "$(readlink "$node_link")" == "$node_name" && ! -L "$node_target" && -x "$node_link/bin/node" ]] &&
    [[ "$("$node_link/bin/node" --version)" == "v$node_version" ]]; then
    echo "OSEKOLA_NODE_READY: $node_link/bin/node v$node_version (already installed)"
    exit 0
  fi
  echo 'An existing runtime needs review; no replacement performed' >&2
  exit 1
fi
[[ ! -e "$node_target" && ! -L "$node_target" ]] || { echo 'Existing version directory needs review' >&2; exit 1; }

runtime_temp="$(mktemp -d "$runtime_root/.install.XXXXXX")"
trap 'rm -rf "$runtime_temp"' EXIT
cd "$runtime_temp"
archive="$node_name.tar.xz"
release_url="https://nodejs.org/dist/v$node_version"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fSL --retry 2 --connect-timeout 10 --max-time 180 \
  "$release_url/$archive" -o "$archive"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fSL --retry 2 --connect-timeout 10 --max-time 30 \
  "$release_url/SHASUMS256.txt" -o SHASUMS256.txt
checksum="$(awk -v archive="$archive" '$2 == archive {print $1}' SHASUMS256.txt)"
[[ "$checksum" =~ ^[a-f0-9]{64}$ ]] || { echo 'Missing or ambiguous official checksum' >&2; exit 1; }
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict -
tar --extract --xz --file "$archive" --no-same-owner --no-same-permissions
[[ "$("$runtime_temp/$node_name/bin/node" --version)" == "v$node_version" ]] || { echo 'Runtime version check failed' >&2; exit 1; }
mv -T "$runtime_temp/$node_name" "$node_target"
ln -s "$node_name" "$node_link"
echo "OSEKOLA_NODE_READY: $node_link/bin/node v$node_version"
echo 'Runtime only. API deployment, production secrets and live verification remain pending.'
