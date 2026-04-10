# OMS v2 Expand/Contract Rollout

This runbook rolls out immutable snapshots, billing decomposition, payment/refund lifecycle, rider assignment events, and ledger postings without service disruption.

## Feature Flags

- `OMS_LEDGER_SHADOW_WRITE`
  - `true`: finalize flow writes v2 snapshot/billing/ledger tables.
  - `false`: old behavior only.
- `OMS_RIDER_ASSIGNMENT_V2`
  - `true`: rider tracking requires active assignment in `order_rider_assignments_current`; assignment event API enabled.
  - `false`: legacy rider tracking behavior.
- `OMS_READ_CANONICAL_V2`
  - read-cutover marker (kept `false` initially).

## Phase A: Expand (Additive)

1. Run migration `backend/drizzle/0182_oms_billing_ledger_foundation.sql`.
2. Deploy backend with:
   - `OMS_LEDGER_SHADOW_WRITE=true`
   - `OMS_RIDER_ASSIGNMENT_V2=true`
   - `OMS_READ_CANONICAL_V2=false`
3. Validate basic writes:
   - Place/finalize sample orders.
   - Confirm rows in:
     - `order_version_snapshots`
     - `order_bill_summary_versions`
     - `payment_intents` / `payment_transactions`
     - `ledger_journals` / `ledger_entries`

## Phase B: Backfill + Reconcile

1. Backfill from `pending_orders.billing_snapshot`:
   - `npx tsx scripts/backfill-oms-ledger.ts --limit=1000`
2. Run reconciler:
   - `npx tsx scripts/reconcile-oms-ledger.ts --limit=2000`
3. Must be zero for:
   - unbalanced journals
   - rider idempotency duplicates
   - bill-math failures (or explicitly waived with incident notes)

## Phase C: Read Cutover

1. Update read APIs/reporting to consume v2 canonical tables.
2. Enable `OMS_READ_CANONICAL_V2=true`.
3. Keep shadow writes on for at least one release cycle.

## Phase D: Contract (Retire Legacy Paths)

1. Remove unused dual-write code.
2. Freeze writes to legacy tables behind API guardrails.
3. After stable period + audit sign-off, archive/deprecate old compatibility tables/views.

## Rollback

- Immediate rollback: set
  - `OMS_LEDGER_SHADOW_WRITE=false`
  - `OMS_RIDER_ASSIGNMENT_V2=false`
- Keep migration tables in place (safe additive rollback).
