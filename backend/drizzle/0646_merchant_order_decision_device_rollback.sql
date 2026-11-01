-- Rollback 0646_merchant_order_decision_device
--
-- Dropping these columns discards the only record of which device decided each
-- order. Nothing else reads them, so leaving them in place is harmless and is
-- the default; uncomment the DROPs only if the columns must genuinely go.

BEGIN;

-- ALTER TABLE public.orders_food
--   DROP COLUMN IF EXISTS decision_device_id,
--   DROP COLUMN IF EXISTS decision_user_id;

COMMIT;
