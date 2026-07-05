#!/usr/bin/env bash
# =============================================================================
#  cashfree-smoke.sh — nightly Cashfree sandbox smoke test
#
#  Verifies every product our verification module depends on still returns
#  its expected response shape. Intended to run from CI (a scheduled workflow)
#  or from cron on a jump box. Exits non-zero if any product regressed so the
#  next run's failure surfaces in alerting.
#
#  Env expected (do NOT commit values):
#    CASHFREE_SANDBOX_CLIENT_ID
#    CASHFREE_SANDBOX_CLIENT_SECRET
#    SMOKE_ALERT_WEBHOOK   (optional — Slack incoming webhook for failures)
#
#  Test inputs are the sandbox test values documented at
#  https://www.cashfree.com/docs/api-reference/vrs/data-to-test-integration
#  and confirmed live during Phase 2 (see phase-2-spec artifact §C).
# =============================================================================
set -uo pipefail

: "${CASHFREE_SANDBOX_CLIENT_ID:?required}"
: "${CASHFREE_SANDBOX_CLIENT_SECRET:?required}"

BASE="${CASHFREE_SANDBOX_BASE_URL:-https://sandbox.cashfree.com/verification}"
N="$(date +%s)"
FAILURES=0
REPORT=""

hit() { # name path body [expected_field]
  local name="$1" path="$2" body="$3" expected="${4:-}"
  local http body_file
  body_file="$(mktemp)"
  http=$(curl -sS -o "$body_file" -w "%{http_code}" -X POST "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "x-client-id: $CASHFREE_SANDBOX_CLIENT_ID" \
    -H "x-client-secret: $CASHFREE_SANDBOX_CLIENT_SECRET" \
    -d "$body")
  local ok="pass"
  if [[ "$http" != "200" ]]; then
    ok="fail(http=$http)"
    ((FAILURES++))
  elif [[ -n "$expected" ]] && ! grep -q "\"$expected\"" "$body_file"; then
    ok="fail(missing $expected)"
    ((FAILURES++))
  fi
  REPORT+="[${ok}] ${name} (${http})"$'\n'
  rm -f "$body_file"
}

# ── Personal identity ─────────────────────────────────────────────────────
hit "PAN valid" /pan \
  "{\"verification_id\":\"smoke_pan_$N\",\"pan\":\"ABCPV1234D\",\"name\":\"John Doe\"}" \
  registered_name
hit "PAN invalid" /pan \
  "{\"verification_id\":\"smoke_pan_bad_$N\",\"pan\":\"AAAAA0000A\",\"name\":\"Nobody\"}" \
  reference_id

hit "DL valid"   /driving-license \
  "{\"verification_id\":\"smoke_dl_$N\",\"dl_number\":\"KA0120198900984\",\"dob\":\"1994-08-05\"}" \
  details_of_driving_licence

hit "RC valid"   /vehicle-rc \
  "{\"verification_id\":\"smoke_rc_$N\",\"vehicle_number\":\"HJ01ME5678\"}" \
  reg_no

hit "Passport valid" /passport \
  "{\"verification_id\":\"smoke_pp_$N\",\"file_number\":\"PA1234567890123\",\"dob\":\"1994-08-05\"}" \
  application_type

# ── Financial ─────────────────────────────────────────────────────────────
hit "IFSC valid"    /ifsc \
  "{\"verification_id\":\"smoke_ifsc_$N\",\"ifsc\":\"KKBK0000958\"}" \
  bank

# ── KYB ───────────────────────────────────────────────────────────────────
hit "GSTIN valid"   /gstin \
  "{\"GSTIN\":\"29AAICP2912R1ZR\",\"business_name\":\"UJJIVAN\"}" \
  legal_name_of_business

hit "CIN valid"     /cin \
  "{\"verification_id\":\"smoke_cin_$N\",\"cin\":\"U72900KA2015PTC082989\"}" \
  company_name

# ── Multi-step (create step only) ─────────────────────────────────────────
hit "DigiLocker create" /digilocker \
  "{\"verification_id\":\"smoke_dl_link_$N\",\"document_requested\":[\"AADHAAR\",\"PAN\"],\"user_flow\":\"signin\"}" \
  shortCode

hit "RPD create"        /reverse-penny-drop \
  "{\"verification_id\":\"smoke_rpd_$N\",\"name\":\"Smoke Test\"}" \
  upi_link

echo "$REPORT"

if [[ $FAILURES -gt 0 ]]; then
  echo "$FAILURES product(s) regressed"
  # Optional Slack notification.
  if [[ -n "${SMOKE_ALERT_WEBHOOK:-}" ]]; then
    curl -sS -X POST "$SMOKE_ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"text":"Cashfree sandbox smoke: %d failure(s)\\n%s"}' "$FAILURES" "$(echo "$REPORT" | tr -d '\r')")" \
      >/dev/null 2>&1 || true
  fi
  exit 1
fi

echo "all products OK"
exit 0
