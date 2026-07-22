-- Rollback 0440 · Rider payout independence from the customer delivery fee
--
-- Removes the reporting columns + forward-sync trigger. Note: the rider-payout
-- behaviour itself lives in the billing pipeline (billing_snapshot.delivery_fee_gross)
-- and the payout resolvers, not in these columns — dropping them only removes the
-- queryable reporting mirror, it does NOT re-couple rider pay to the customer fee.

DROP TRIGGER IF EXISTS trg_orders_core_delivery_economics ON orders_core;
DROP FUNCTION IF EXISTS orders_core_sync_delivery_economics();

ALTER TABLE orders_core
  DROP COLUMN IF EXISTS delivery_subsidy,
  DROP COLUMN IF EXISTS delivery_fee_gross;
