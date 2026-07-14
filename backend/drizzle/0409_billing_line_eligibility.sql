-- Offer Engine v2: persist per-line discount eligibility on placed order items.
-- Historical rows remain NULL; new placements write from billing_snapshot.

ALTER TABLE orders_core_items
  ADD COLUMN IF NOT EXISTS is_discount_eligible boolean;

COMMENT ON COLUMN orders_core_items.is_discount_eligible IS
  'Offer Engine v2: false when line had MRP strike or item-surface promo (Boost/BOGO/etc). NULL = legacy row.';

-- billing_snapshot JSON (orders_core.billing_snapshot / pending_orders) now includes:
--   eligibleSubtotal / eligible_subtotal
--   orderLineEligibility / order_line_eligibility[]
-- No DDL change required for jsonb.
