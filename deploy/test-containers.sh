#!/usr/bin/env bash
set -euo pipefail
release_sha="${1:?Pass full release SHA}"
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]]
test_env="$(mktemp)"
cleanup() {
  test_status=$?
  if [[ "$test_status" != 0 ]]; then
    docker logs --tail 80 atsekola-api-ci 2>&1 || true
    docker logs --tail 80 atsekola-web-ci 2>&1 || true
  fi
  docker rm -f atsekola-api-ci atsekola-web-ci >/dev/null 2>&1 || true
  rm -f "$test_env"
}
trap cleanup EXIT
docker build -f deploy/Dockerfile --target api --build-arg RELEASE_SHA="$release_sha" -t atsekola-api:ci .
docker build -f deploy/Dockerfile --target web --build-arg RELEASE_SHA="$release_sha" \
  --build-arg NEXT_PUBLIC_API_URL=https://api.invalid \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://database.invalid \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_fixture -t atsekola-web:ci .
for app in api web; do [[ "$(docker image inspect "atsekola-$app:ci" --format '{{.Config.User}}')" == node ]]; done
docker run -d --name atsekola-api-ci --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:3101:3001 -e SUPABASE_URL=https://database.invalid \
  -e SUPABASE_SERVICE_ROLE_KEY=ci-fixture-only -e CORS_ORIGINS=https://school.invalid atsekola-api:ci
docker run -d --name atsekola-web-ci --read-only --tmpfs /tmp \
  --tmpfs /app/apps/web/.next/cache:uid=1000,gid=1000 --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:3100:3000 atsekola-web:ci
EXPECTED_RELEASE_SHA="$release_sha" node deploy/test-containers.mjs
# Validate the production ingress and compose configuration without requesting TLS.
docker run --rm -e WEB_DOMAIN=school.invalid -e API_DOMAIN=api.invalid -e ACME_EMAIL=ops@example.invalid \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
cp deploy/api.env.example "$test_env"
RELEASE_SHA="$release_sha" WEB_DOMAIN=school.invalid API_DOMAIN=api.invalid ACME_EMAIL=ops@example.invalid \
  API_ENV_FILE="$test_env" \
  NEXT_PUBLIC_SUPABASE_URL=https://database.invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_fixture \
  docker compose -f deploy/compose.production.yml config --quiet
