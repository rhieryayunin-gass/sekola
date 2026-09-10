#!/usr/bin/env bash
set -euo pipefail
# Run on a build worker, not the shared trading VPS.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || { echo 'Build from a clean reviewed checkout' >&2; exit 1; }
release_sha="$(git rev-parse HEAD)"
archive="${1:?Pass a new absolute .tar.gz output path outside the repository}"
[[ "$archive" == /*.tar.gz && ! -e "$archive" && "$archive" != "$repo_root"/* ]] || { echo 'Use a new absolute archive path outside the repository' >&2; exit 1; }
package_temp="$(mktemp -d)"
trap 'rm -rf "$package_temp"' EXIT
pnpm --filter @sekola/api build
pnpm --filter @sekola/api deploy --prod --legacy "$package_temp/api"
printf 'RELEASE_SHA=%s\n' "$release_sha" > "$package_temp/api/release.env"
tar -czf "$archive" -C "$package_temp/api" .
sha256sum "$archive"
echo "API release packaged: $release_sha"
