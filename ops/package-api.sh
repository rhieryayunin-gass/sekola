#!/usr/bin/env bash
set -euo pipefail
# Run on a build worker, not the shared trading VPS.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || { echo 'Build from a clean reviewed checkout' >&2; exit 1; }
release_sha="$(git rev-parse HEAD)"
archive="${1:?Pass a new absolute .tar.gz output path outside the repository}"
[[ "$archive" == /*.tar.gz && ! -e "$archive" && "$archive" != "$repo_root"/* ]] || { echo 'Use a new absolute archive path outside the repository' >&2; exit 1; }
for output in "$archive.sha256" "${archive%.tar.gz}-stage.sh" "${archive%.tar.gz}-release.txt"; do
  [[ ! -e "$output" && ! -L "$output" ]] || { echo 'Use new companion file paths' >&2; exit 1; }
done
package_temp="$(mktemp -d)"
trap 'rm -rf "$package_temp"' EXIT
pnpm --filter @sekola/api build
pnpm --filter @sekola/api deploy --prod --legacy "$package_temp/api"
printf 'RELEASE_SHA=%s\n' "$release_sha" > "$package_temp/api/release.env"
mkdir "$package_temp/api/deploy"
cp deploy/osekola/api.env.example deploy/osekola/osekola-api.service "$package_temp/api/deploy/"
node - "$package_temp/api/package-meta.json" "$release_sha" <<'JS'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({ release: process.argv[3], platform: process.platform, arch: process.arch, node: process.version }) + '\n');
JS
tar -czf "$archive" -C "$package_temp/api" .
(cd "$(dirname "$archive")" && sha256sum "$(basename "$archive")") > "$archive.sha256"
cp ops/stage-osekola-api.sh "${archive%.tar.gz}-stage.sh"
printf '%s\n' "$release_sha" > "${archive%.tar.gz}-release.txt"
cat "$archive.sha256"
echo "API release packaged: $release_sha"
