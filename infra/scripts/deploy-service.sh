#!/usr/bin/env bash
# Roll a single docker-compose service to a new image with zero downtime.
#
# Strategy
# --------
# 1. Pull the new image.
# 2. Snapshot the OLD container id BEFORE scaling.
# 3. Adopt an orphan replica left behind by an interrupted earlier run, if any
#    (see RECOVERY below) — otherwise trim to a single replica.
# 4. `--scale <svc>=2 --no-recreate` adds a second container running the
#    freshly pulled image, leaving the old one untouched. Both join the
#    docker network; nginx's upstream DNS round-robins across both, so
#    inbound traffic keeps flowing.
# 5. Poll the new container's health URL from inside the container.
# 6. On success: stop + remove the OLD container by id (so the new one
#    becomes the sole replica). Compose's `--scale=1` is unreliable here
#    because it keeps the lowest-numbered container, which is the OLD one.
# 7. On failure: stop + remove the NEW container; old keeps serving.
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

# --- helpers ---------------------------------------------------------------

# Serialise docker IMAGE operations across every deploy on this box.
#
# A merge that touches several services fires several deploy workflows at once,
# and they all land on this one VPS within seconds of each other. Docker's image
# store does not tolerate that:
#
#   failed to extract layer ... to overlayfs: failed call to UtimesNanoAt for
#   /var/lib/containerd/.../fs/app/node_modules/.bin: no such file or directory
#
# Files disappearing mid-extract is one deploy's `docker image prune` deleting
# layers another deploy is still pulling - a partially pulled image looks
# dangling. It has broken a deploy on three separate merges, and the workaround
# each time was to re-run the failed jobs one at a time by hand.
#
# So take a lock around pull and prune only. The health wait and the container
# swap are per-service and safe to overlap, which keeps deploys mostly parallel;
# only the few seconds that actually touch the shared image store queue up.
#
# Fail-open by design: if flock is missing or the lock file cannot be created,
# run the command unlocked rather than fail a deploy over a lock.
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/gatimitra-deploy-images.lock}"
DEPLOY_LOCK_WAIT="${DEPLOY_LOCK_WAIT:-900}"

with_image_lock() {
  if ! command -v flock >/dev/null 2>&1; then
    "$@"
    return $?
  fi
  if ! : >>"$DEPLOY_LOCK_FILE" 2>/dev/null; then
    echo "⚠ deploy: $svc — cannot open $DEPLOY_LOCK_FILE; running unlocked"
    "$@"
    return $?
  fi
  local started waited rc=0
  started=$(date +%s)
  # -w, not a blocking wait: a deploy killed mid-pull would otherwise leave
  # every later deploy hanging until its own job timeout.
  {
    if ! flock -w "$DEPLOY_LOCK_WAIT" 9; then
      # Report what actually elapsed, not the budget: flock can also fail fast
      # for reasons that have nothing to do with contention, and a log line
      # claiming a 900s wait that never happened sends the next reader hunting
      # a stall that was not there.
      waited=$(( $(date +%s) - started ))
      echo "⚠ deploy: $svc — image lock not acquired after ${waited}s (budget ${DEPLOY_LOCK_WAIT}s); proceeding anyway"
    else
      waited=$(( $(date +%s) - started ))
      [[ $waited -ge 5 ]] && echo "▶ deploy: $svc — waited ${waited}s for the image lock"
    fi
    "$@" || rc=$?
  } 9>>"$DEPLOY_LOCK_FILE"
  return $rc
}

# Image id a container was actually started from (not the tag, which moves).
container_image_id() {
  docker inspect --format '{{.Image}}' "$1" 2>/dev/null || true
}

# Poll the health URL from inside $1 until it answers, or max_wait elapses.
wait_healthy() {
  local cid="$1" deadline
  deadline=$(( $(date +%s) + max_wait ))
  while [[ $(date +%s) -lt $deadline ]]; do
    if docker exec "$cid" sh -c \
        "wget -q -O- --timeout=3 '$health_url' >/dev/null 2>&1 \
         || curl -fsS --max-time 3 '$health_url' >/dev/null 2>&1"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

retire() {
  local c
  for c in "$@"; do
    docker stop "$c" >/dev/null 2>&1 || true
    docker rm   "$c" >/dev/null 2>&1 || true
  done
}

# Force nginx to re-resolve upstream hostnames. Without this, nginx caches the
# old container's IP at startup; after a redeploy the new container gets a
# fresh IP and traffic for that service silently 404s (or worse, lands on a
# sibling service that took over the old IP — e.g. partnersite picking up
# backend's old IP since both listen on :3000). Best-effort: if nginx isn't
# running yet (first deploy) or the reload fails, log it and continue — we
# already verified the new container is healthy.
# Most upstreams in infra/nginx/nginx.conf are STATIC (`upstream backend {
# server backend:3000; keepalive 32; }`), which nginx resolves to a container IP
# once, at config load. A redeploy gives the container a new IP, so the reload
# below is what re-resolves it.
#
# The catch is timing. Reloading immediately after `docker rm` of the old
# container is a race: Docker's embedded DNS can still hand back the dead IP,
# and nginx then caches THAT until the next reload — leaving the service 502
# behind a deploy that reported success. Observed three times in a row on
# backend; the one deploy that came up healthy simply won the race.
#
# So: let DNS settle, reload, then reload again a few seconds later. The second
# reload costs nothing and closes the window for good.
reload_nginx() {
  [[ "$svc" == "nginx" ]] && return 0
  local nginx_cid
  nginx_cid=$("${compose[@]}" ps -q nginx | head -1 || true)
  if [[ -z "$nginx_cid" ]]; then
    echo "⚠ deploy: $svc — no nginx container found; skipping reload"
    return 0
  fi

  local attempt
  for attempt in 1 2; do
    sleep "${NGINX_RELOAD_SETTLE_SECONDS:-5}"
    echo "▶ deploy: $svc — reloading nginx to re-resolve upstream DNS (pass $attempt/2)"
    if docker exec "$nginx_cid" nginx -s reload 2>/dev/null; then
      echo "✔ deploy: $svc — nginx reloaded"
    else
      echo "⚠ deploy: $svc — nginx reload failed (not fatal; manual restart may be needed)"
    fi
  done
}

# Pre-flight: when deploying nginx, validate the new config inside a throwaway
# container BEFORE swapping the running one. Catches `worker_processes
# directive not allowed here` (wrong mount path) and similar syntax errors
# before they take traffic offline.
if [[ "$svc" == "nginx" ]]; then
  echo "▶ deploy: $svc — running nginx -t against the new config"
  if ! docker run --rm \
      -v "$(dirname "$compose_file")/../nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
      -v "$(dirname "$compose_file")/../nginx/proxy_common.conf:/etc/nginx/proxy_common.conf:ro" \
      -v "$(dirname "$compose_file")/../nginx/static/rider-digilocker-return.html:/etc/nginx/html/rider-digilocker-return.html:ro" \
      nginx:1.27-alpine nginx -t -q 2>&1; then
    echo "✖ deploy: $svc — nginx config validation failed; refusing to deploy" >&2
    exit 1
  fi
fi

echo "▶ deploy: $svc — pulling new image"
with_image_lock "${compose[@]}" pull "$svc"

# Snapshot existing container(s) BEFORE scaling. There may be 0 (first
# deploy) or 1 (steady state). On a clean first deploy, just bring it up.
mapfile -t old_cids < <("${compose[@]}" ps -q "$svc" || true)

if [[ ${#old_cids[@]} -eq 0 ]]; then
  echo "▶ deploy: $svc — no running container, starting fresh"
  "${compose[@]}" up -d --no-deps "$svc"
  exit 0
fi

echo "▶ deploy: $svc — old container(s): ${old_cids[*]}"

# RECOVERY ------------------------------------------------------------------
# A run can die between "start the new replica" and the health check — the CI
# step has a wall-clock timeout, and a slow image pull can eat most of it. That
# leaves TWO replicas behind. On the next run both counted as "old", so
# `--scale=2` was already satisfied, no third container was ever created, and
# the script failed with "could not identify new container" on every retry: a
# stuck state no re-run could clear, with the service still serving the
# PREVIOUS image.
#
# So look at what is already running before scaling. A replica started from the
# image we just pulled is the orphan of that interrupted deploy — adopt it
# rather than trying to add another one.
target_image=$("${compose[@]}" config --images "$svc" 2>/dev/null | head -1 || true)
target_id=""
if [[ -n "$target_image" ]]; then
  target_id=$(docker image inspect --format '{{.Id}}' "$target_image" 2>/dev/null || true)
fi

fresh=()
stale=()
if [[ -n "$target_id" ]]; then
  for cid in "${old_cids[@]}"; do
    if [[ "$(container_image_id "$cid")" == "$target_id" ]]; then
      fresh+=("$cid")
    else
      stale+=("$cid")
    fi
  done
fi

if [[ -n "$target_id" && ${#fresh[@]} -ge 1 && ${#stale[@]} -ge 1 ]]; then
  adopt="${fresh[0]}"
  echo "▶ deploy: $svc — up-to-date orphan replica $adopt left by an interrupted deploy; adopting it"
  if wait_healthy "$adopt"; then
    # Retire everything except the replica just adopted: the stale ones, and any
    # extra up-to-date duplicates repeated interruptions may have left.
    doomed=()
    for cid in "${old_cids[@]}"; do
      [[ "$cid" == "$adopt" ]] || doomed+=("$cid")
    done
    echo "▶ deploy: $svc — orphan healthy; retiring ${#doomed[@]} other replica(s)"
    retire ${doomed[@]+"${doomed[@]}"}
    reload_nginx
    echo "▶ deploy: $svc — pruning dangling images"
    # Housekeeping only. By this point the new replica is healthy, the old one is
    # retired and nginx has been reloaded - the release is already live. A prune
    # that is slow (many dangling layers) or stuck must therefore never fail the
    # deploy: one backend roll burned its entire 20-minute job budget here AFTER a
    # fully successful release, reported failure, and skipped the public-endpoint
    # verification that would have shown the deploy was fine.
    with_image_lock timeout 90 docker image prune -f >/dev/null 2>&1 || echo "⚠ deploy: $svc — image prune skipped (slow or unavailable); release is unaffected"
    echo "✔ deploy: $svc — done (recovered an interrupted deploy)"
    exit 0
  fi
  echo "✖ deploy: $svc — orphan never became healthy; discarding it and deploying fresh" >&2
  docker logs "$adopt" --tail 200 || true
  retire ${fresh[@]+"${fresh[@]}"}
  mapfile -t old_cids < <("${compose[@]}" ps -q "$svc" || true)
  if [[ ${#old_cids[@]} -eq 0 ]]; then
    echo "▶ deploy: $svc — nothing left running, starting fresh"
    "${compose[@]}" up -d --no-deps "$svc"
    reload_nginx
    exit 0
  fi
fi

# Never scale on top of more than one replica — that is what produced the
# unrecoverable state above.
if [[ ${#old_cids[@]} -gt 1 ]]; then
  echo "▶ deploy: $svc — ${#old_cids[@]} replicas running; trimming to one before scaling"
  retire "${old_cids[@]:1}"
  old_cids=("${old_cids[0]}")
fi

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
healthy=0
wait_healthy "$new_cid" && healthy=1

if [[ $healthy -ne 1 ]]; then
  echo "✖ deploy: $svc — new replica never became healthy; rolling back" >&2

  echo "===== FAILED CONTAINER LOGS ====="
  docker logs "$new_cid" --tail 500 || true

  # State + health probe history only. NEVER a bare `docker inspect` here: it
  # includes Config.Env, and this output goes to the CI log.
  echo "===== FAILED CONTAINER STATE ====="
  docker inspect --format '{{json .State}}' "$new_cid" || true

  docker stop "$new_cid" >/dev/null || true
  docker rm   "$new_cid" >/dev/null || true

  exit 1
fi

echo "▶ deploy: $svc — healthy; removing old replica(s)"
retire "${old_cids[@]}"

reload_nginx

echo "▶ deploy: $svc — pruning dangling images"
# Housekeeping only. By this point the new replica is healthy, the old one is
# retired and nginx has been reloaded - the release is already live. A prune
# that is slow (many dangling layers) or stuck must therefore never fail the
# deploy: one backend roll burned its entire 20-minute job budget here AFTER a
# fully successful release, reported failure, and skipped the public-endpoint
# verification that would have shown the deploy was fine.
with_image_lock timeout 90 docker image prune -f >/dev/null 2>&1 || echo "⚠ deploy: $svc — image prune skipped (slow or unavailable); release is unaffected"

echo "✔ deploy: $svc — done"
