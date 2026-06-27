#!/usr/bin/env bash
# Roll a single docker-compose service to a new image with zero downtime.
#
# Strategy
# --------
# 1. Pull the new image.
# 2. Snapshot the OLD container id BEFORE scaling.
# 3. `--scale <svc>=2 --no-recreate` adds a second container running the
#    freshly pulled image, leaving the old one untouched. Both join the
#    docker network; nginx's upstream DNS round-robins across both, so
#    inbound traffic keeps flowing.
# 4. Poll the new container's health URL from inside the container.
# 5. On success: stop + remove the OLD container by id (so the new one
#    becomes the sole replica). Compose's `--scale=1` is unreliable here
#    because it keeps the lowest-numbered container, which is the OLD one.
# 6. On failure: stop + remove the NEW container; old keeps serving.
#
# Usage:
#   deploy-service.sh <service> <health_url> [max_wait_seconds]
#
# Env on the VPS:
#   COMPOSE_FILE  — defaults to /opt/gatimitra/infra/docker/docker-compose.prod.yml
#
# Exit codes:
#   0  success
#   1  new replica failed health checks; rolled back
#   2  bad args

set -euo pipefail

svc="${1:-}"
health_url="${2:-}"
max_wait="${3:-90}"
compose_file="${COMPOSE_FILE:-/opt/gatimitra/infra/docker/docker-compose.prod.yml}"

if [[ -z "$svc" || -z "$health_url" ]]; then
  echo "usage: $0 <service> <health_url> [max_wait_seconds]" >&2
  exit 2
fi

compose=(docker compose -f "$compose_file")

# Pre-flight: when deploying nginx, validate the new config inside a throwaway
# container BEFORE swapping the running one. Catches `worker_processes
# directive not allowed here` (wrong mount path) and similar syntax errors
# before they take traffic offline.
if [[ "$svc" == "nginx" ]]; then
  echo "▶ deploy: $svc — running nginx -t against the new config"
  if ! docker run --rm \
      -v "$(dirname "$compose_file")/../nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
      -v "$(dirname "$compose_file")/../nginx/proxy_common.conf:/etc/nginx/proxy_common.conf:ro" \
      nginx:1.27-alpine nginx -t -q 2>&1; then
    echo "✖ deploy: $svc — nginx config validation failed; refusing to deploy" >&2
    exit 1
  fi
fi

echo "▶ deploy: $svc — pulling new image"
"${compose[@]}" pull "$svc"

# Snapshot existing container(s) BEFORE scaling. There may be 0 (first
# deploy) or 1 (steady state). On a clean first deploy, just bring it up.
mapfile -t old_cids < <("${compose[@]}" ps -q "$svc" || true)

if [[ ${#old_cids[@]} -eq 0 ]]; then
  echo "▶ deploy: $svc — no running container, starting fresh"
  "${compose[@]}" up -d --no-deps "$svc"
  exit 0
fi

echo "▶ deploy: $svc — old container(s): ${old_cids[*]}"

echo "▶ deploy: $svc — scaling to add a new replica"
"${compose[@]}" up -d --no-deps --scale "${svc}=2" --no-recreate "$svc"

# Find the new container id — it's whatever is in `ps -q` but NOT in old_cids.
new_cid=""
for cid in $("${compose[@]}" ps -q "$svc"); do
  is_old=0
  for old in "${old_cids[@]}"; do
    [[ "$cid" == "$old" ]] && is_old=1 && break
  done
  [[ $is_old -eq 0 ]] && new_cid="$cid" && break
done

if [[ -z "$new_cid" ]]; then
  echo "✖ deploy: $svc — could not identify new container" >&2
  exit 1
fi
echo "▶ deploy: $svc — new container: $new_cid"

echo "▶ deploy: $svc — waiting up to ${max_wait}s for $health_url"
deadline=$(( $(date +%s) + max_wait ))
healthy=0
while [[ $(date +%s) -lt $deadline ]]; do
  if docker exec "$new_cid" sh -c \
      "wget -q -O- --timeout=3 '$health_url' >/dev/null 2>&1 \
       || curl -fsS --max-time 3 '$health_url' >/dev/null 2>&1"; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ $healthy -ne 1 ]]; then
  echo "✖ deploy: $svc — new replica never became healthy; rolling back" >&2

  echo "===== FAILED CONTAINER LOGS ====="
  docker logs "$new_cid" --tail 500 || true

  echo "===== FAILED CONTAINER INSPECT ====="
  docker inspect "$new_cid" || true

  docker stop "$new_cid" >/dev/null || true
  docker rm   "$new_cid" >/dev/null || true

  exit 1
fi

echo "▶ deploy: $svc — healthy; removing old replica(s)"
for old in "${old_cids[@]}"; do
  docker stop "$old" >/dev/null || true
  docker rm   "$old" >/dev/null || true
done

# Force nginx to re-resolve upstream hostnames. Without this, nginx caches the
# old container's IP at startup; after a redeploy the new container gets a
# fresh IP and traffic for that service silently 404s (or worse, lands on a
# sibling service that took over the old IP — e.g. partnersite picking up
# backend's old IP since both listen on :3000). The exec is best-effort: if
# nginx isn't running yet (first deploy) or the reload fails, log it and
# continue — we already verified the new container is healthy.
if [[ "$svc" != "nginx" ]]; then
  echo "▶ deploy: $svc — reloading nginx to re-resolve upstream DNS"
  nginx_cid=$("${compose[@]}" ps -q nginx | head -1 || true)
  if [[ -n "$nginx_cid" ]]; then
    if docker exec "$nginx_cid" nginx -s reload 2>/dev/null; then
      echo "✔ deploy: $svc — nginx reloaded"
    else
      echo "⚠ deploy: $svc — nginx reload failed (not fatal; manual restart may be needed)"
    fi
  fi
fi

echo "▶ deploy: $svc — pruning dangling images"
docker image prune -f >/dev/null

echo "✔ deploy: $svc — done"
