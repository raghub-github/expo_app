#!/usr/bin/env bash
# Confirm a service is reachable through nginx on its PUBLIC hostname.
#
# deploy-service.sh only ever probes the health URL from INSIDE the new
# container, so it cannot tell whether nginx is actually routing to it. That gap
# is how three backend deploys in a row printed "✔ done" and went green while
# api.gatimitra.com served 502 from a cached, dead upstream IP.
#
# Run this after a deploy. A deploy that left the service unreachable must fail.
#
# Any 2xx or 3xx counts as reachable: several of these hosts legitimately answer
# a redirect (control/partner bounce to login, treasury 303). What we are
# testing is that nginx resolves the upstream and the app answers at all — 502,
# 504 and a connection failure are the failures that matter.
#
# Usage:
#   verify-public-endpoint.sh <url> [attempts] [sleep_seconds]

set -euo pipefail

url="${1:-}"
attempts="${2:-12}"
nap="${3:-10}"

if [[ -z "$url" ]]; then
  echo "usage: $0 <url> [attempts] [sleep_seconds]" >&2
  exit 2
fi

for attempt in $(seq 1 "$attempts"); do
  code=$(curl -s -o /tmp/_verify_body -w '%{http_code}' --max-time 10 "$url" || echo 000)
  case "$code" in
    2??|3??)
      echo "✔ verify: $url -> $code"
      head -c 400 /tmp/_verify_body 2>/dev/null || true
      echo
      exit 0
      ;;
  esac
  echo "verify: $url -> $code (attempt $attempt/$attempts)"
  [[ "$attempt" -lt "$attempts" ]] && sleep "$nap"
done

echo "::error::$url never became reachable after the deploy (last status: $code)."
echo "::error::The container can be healthy while nginx holds a stale upstream IP."
echo "::error::Reload nginx on the VPS, or re-run this workflow."
exit 1
