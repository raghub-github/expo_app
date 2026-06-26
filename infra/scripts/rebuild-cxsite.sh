#!/usr/bin/env bash
# Convenience wrapper — rebuild + redeploy the customer marketing/policy
# site (cxsite, gatimitra.com) on the VPS.
#
# This is a thin wrapper around `rebuild-local.sh cxsite` so operators can
# `tab-complete the obvious filename. All build logic lives in
# rebuild-local.sh.

set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
exec "$DIR/rebuild-local.sh" cxsite
