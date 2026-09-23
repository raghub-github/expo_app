-- Rollback 0641: remove backfilled formatted_order_id keys from pending checkout_metadata.
-- Does not delete other metadata keys.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

UPDATE pending_orders
SET
  checkout_metadata = checkout_metadata - 'formatted_order_id',
  updated_at = NOW()
WHERE checkout_metadata ? 'formatted_order_id';

RESET lock_timeout;
RESET statement_timeout;
