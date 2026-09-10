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
node - "$package_temp/api/package-meta.json" "$release_sha" "$repo_root/apps/api" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(process.argv[2]);
// pnpm legacy deploy leaves a self-reference pointing at the build checkout.
// Relocate that known alias, then reject any other non-portable package links.
const selfAlias = path.join(root, 'node_modules/.pnpm/node_modules/@sekola/api');
if (fs.lstatSync(selfAlias, { throwIfNoEntry: false })?.isSymbolicLink()) {
  const target = path.resolve(path.dirname(selfAlias), fs.readlinkSync(selfAlias));
  if (target === path.resolve(process.argv[4])) {
    fs.unlinkSync(selfAlias);
    fs.symlinkSync(path.relative(path.dirname(selfAlias), root), selfAlias);
  }
}
const invalid = [];
function auditLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(file);
      const target = path.resolve(path.dirname(file), link);
      if (path.isAbsolute(link) || (target !== root && !target.startsWith(root + path.sep))) invalid.push(path.relative(root, file));
    } else if (entry.isDirectory()) auditLinks(file);
  }
}
auditLinks(root);
if (invalid.length) throw new Error('Non-portable package links: ' + invalid.join(', '));
fs.writeFileSync(process.argv[2], JSON.stringify({ release: process.argv[3], platform: process.platform, arch: process.arch, node: process.version }) + '\n');
JS
tar -czf "$archive" -C "$package_temp/api" .
(cd "$(dirname "$archive")" && sha256sum "$(basename "$archive")") > "$archive.sha256"
cp ops/stage-osekola-api.sh "${archive%.tar.gz}-stage.sh"
printf '%s\n' "$release_sha" > "${archive%.tar.gz}-release.txt"
cat "$archive.sha256"
echo "API release packaged: $release_sha"
