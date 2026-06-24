#!/usr/bin/env bash
# Rebuild + redeploy one or more services LOCALLY on the VPS using the
# per-service .env.local files for NEXT_PUBLIC_* bake.
#
# Use when GitHub secrets are missing/stale, or you need to ship a hotfix
# without waiting for CI.
#
# Usage (on the VPS):
#   /opt/gatimitra/infra/scripts/rebuild-local.sh dashboard
#   /opt/gatimitra/infra/scripts/rebuild-local.sh partnersite
#   /opt/gatimitra/infra/scripts/rebuild-local.sh dashboard partnersite

set -euo pipefail

REPO="${REPO:-/opt/gatimitra}"
COMPOSE_FILE="$REPO/infra/docker/docker-compose.prod.yml"
ENV_DIR="$REPO/infra/docker"
ENV_FILE="$ENV_DIR/.env"

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <service> [service…]    (dashboard | partnersite)" >&2
  exit 2
fi

# Regenerate the compose .env file from each app's .env.local so the
# docker build sees fresh NEXT_PUBLIC_* values. We grep ONLY NEXT_PUBLIC_*
# lines so secrets like FIREBASE_PRIVATE_KEY (which span multiple lines and
# break shell sourcing) stay out.
mkdir -p "$ENV_DIR"
{
  [[ -f "$REPO/dashboard/.env.local"   ]] && grep '^NEXT_PUBLIC_' "$REPO/dashboard/.env.local"
  [[ -f "$REPO/partnersite/.env.local" ]] && grep '^NEXT_PUBLIC_' "$REPO/partnersite/.env.local"
} | sort -u > "$ENV_FILE"

echo "▶ wrote $ENV_FILE ($(wc -l < "$ENV_FILE") NEXT_PUBLIC_* lines)"

cd "$ENV_DIR"

for svc in "$@"; do
  echo "▶ rebuild: $svc"
  docker compose -f "$COMPOSE_FILE" build "$svc"

  echo "▶ recreate: $svc"
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "$svc"

  echo "▶ wait for $svc to become healthy (up to 120s)"
  for i in $(seq 1 24); do
    s=$(docker inspect --format '{{.State.Health.Status}}' "gatimitra-prod-$svc-*" 2>/dev/null \
        || docker ps --filter "name=gatimitra-prod-$svc" --format '{{.Status}}' | head -1)
    case "$s" in
      *healthy*)  echo "✔ $svc healthy ($s)"; break;;
      *unhealthy*) echo "✖ $svc unhealthy ($s)"; exit 1;;
    esac
    sleep 5
  done
done

docker image prune -f >/dev/null 2>&1 || true
echo "▶ done"
