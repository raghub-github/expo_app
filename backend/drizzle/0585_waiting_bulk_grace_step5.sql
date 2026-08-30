-- Waiting Bulk Grace (Step 5) — a large food order (by value OR item count) legitimately
-- needs more prep time, so it gets extra free minutes before waiting is billable. Thresholds
-- and the extra grace are configurable per service_payout_rule. Additive + idempotent;
-- with all three NULL/0 there is no bulk behavior (unchanged) until an admin sets them.

ALTER TABLE service_payout_rules
  ADD COLUMN IF NOT EXISTS waiting_bulk_value_threshold numeric(14, 2),
  ADD COLUMN IF NOT EXISTS waiting_bulk_item_threshold integer,
  ADD COLUMN IF NOT EXISTS waiting_bulk_extra_grace_minutes integer;

COMMENT ON COLUMN service_payout_rules.waiting_bulk_value_threshold IS
  'Order value (₹) at/above which the order is bulk → extra waiting grace. NULL = value is not a trigger.';
COMMENT ON COLUMN service_payout_rules.waiting_bulk_item_threshold IS
  'Item count at/above which the order is bulk → extra waiting grace. NULL = item count is not a trigger.';
COMMENT ON COLUMN service_payout_rules.waiting_bulk_extra_grace_minutes IS
  'Extra free-wait minutes granted to a bulk order before waiting is billable. NULL/0 = no bulk grace.';
