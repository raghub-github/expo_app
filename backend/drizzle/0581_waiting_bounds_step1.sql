-- Waiting Bounds (Step 1) — cap every waiting charge by BOTH duration and amount.
--
-- Root cause of the ₹1,000+ waiting bug (audit Problem A): the only cap was
-- service_payout_rules.waiting_max_charge, which is nullable and unset for most geos, and
-- there was no duration cap at all. This adds a duration cap column and backfills non-null,
-- admin-tunable defaults so no active rule is uncapped. The pricing engine additionally
-- enforces absolute safety ceilings (WAITING_DEFAULT_MAX_MINUTES / _CHARGE) when a value is
-- still null, so waiting is bounded even before/without this migration.
--
-- Additive + idempotent. Only touches rules that actually charge waiting
-- (waiting_charge_per_min > 0) and only where a cap is currently unset — a geo that already
-- configured a tighter or looser cap is left exactly as the admin set it.

ALTER TABLE service_payout_rules
  ADD COLUMN IF NOT EXISTS waiting_max_minutes integer;

COMMENT ON COLUMN service_payout_rules.waiting_max_minutes IS
  'Max billable waiting minutes (Step 1). NULL → engine safety ceiling; set to cap tighter per geo/service.';

-- Duration cap: default 30 billable minutes where unset and waiting is chargeable.
UPDATE service_payout_rules
SET waiting_max_minutes = 30
WHERE waiting_max_minutes IS NULL
  AND waiting_charge_per_min IS NOT NULL
  AND waiting_charge_per_min > 0;

-- Amount cap: default ₹100 where unset and waiting is chargeable.
UPDATE service_payout_rules
SET waiting_max_charge = 100
WHERE waiting_max_charge IS NULL
  AND waiting_charge_per_min IS NOT NULL
  AND waiting_charge_per_min > 0;
