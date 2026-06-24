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

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <service> [service…]    (dashboard | partnersite)" >&2
  exit 2
fi

# Per-service build because dashboard and partnersite have DIFFERENT
# NEXT_PUBLIC_APP_URL values (control.gatimitra.com vs partner.gatimitra.com).
# Sharing one .env file would let the second-loaded value clobber the first.
# Instead we extract the NEXT_PUBLIC_* lines from each service's .env.local
# and pass them as explicit --build-arg flags.
build_one() {
  local svc="$1"
  local env_local

  case "$svc" in
    dashboard)   env_local="$REPO/dashboard/.env.local" ;;
    partnersite) env_local="$REPO/partnersite/.env.local" ;;
    *)
      echo "✖ unknown service: $svc (supported: dashboard, partnersite)" >&2
      exit 2
      ;;
  esac

  if [[ ! -f "$env_local" ]]; then
    echo "✖ missing env file: $env_local" >&2
    exit 2
  fi

  echo "▶ build: $svc using $env_local"

  # Build --build-arg flags from every NEXT_PUBLIC_* line in the env file.
  # `xargs -I{}` keeps spaces inside values intact.
  local args=()
  while IFS= read -r line; do
    args+=("--build-arg" "$line")
  done < <(grep '^NEXT_PUBLIC_' "$env_local")

  # NOTE: docker compose build can't take --build-arg from a service's env,
  # so we shell out to `docker build` directly. The image tag matches what
  # compose expects so `docker compose up -d` finds the local image.
  local image_tag dockerfile
  case "$svc" in
    dashboard)
      image_tag="ghcr.io/raghub-github/gm-dashboard:latest"
      dockerfile="dashboard/Dockerfile"
      ;;
    partnersite)
      image_tag="ghcr.io/raghub-github/gm-partnersite:latest"
      dockerfile="partnersite/Dockerfile"
      ;;
  esac

  ( cd "$REPO" && docker build -f "$dockerfile" -t "$image_tag" "${args[@]}" . )

  echo "▶ recreate: $svc"
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "$svc"

  echo "▶ wait for $svc to become healthy (up to 120s)"
  local container
  for i in $(seq 1 24); do
    container=$(docker ps --filter "name=gatimitra-prod-$svc-" --format '{{.Names}}' | head -1)
    if [[ -n "$container" ]]; then
      local s
      s=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)
      case "$s" in
        healthy)   echo "✔ $svc healthy ($container)"; return 0;;
        unhealthy) echo "✖ $svc unhealthy ($container)"; return 1;;
      esac
    fi
    sleep 5
  done
  echo "⚠ $svc health uncertain after 120s — check docker ps"
}

for svc in "$@"; do
  build_one "$svc"
done

docker image prune -f >/dev/null 2>&1 || true
echo "▶ done"
