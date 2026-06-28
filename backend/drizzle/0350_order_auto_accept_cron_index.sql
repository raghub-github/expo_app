-- ============================================================================
-- 0350_order_auto_accept_cron_index
-- Supports backend cron: auto-accept CREATED food orders when
-- merchant_store_settings.auto_accept_orders = true.
-- No new columns — uses existing merchant_store_settings + orders_food fields.
-- ============================================================================

-- Fast lookup of unaccepted orders per store (cron scans CREATED/NEW/PLACED rows).
CREATE INDEX IF NOT EXISTS orders_food_merchant_unaccepted_created_idx
  ON public.orders_food (merchant_store_id, created_at ASC)
  WHERE upper(COALESCE(order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
    AND cancelled_at IS NULL;

-- Stores with auto-accept enabled (cron joins settings → orders).
CREATE INDEX IF NOT EXISTS merchant_store_settings_auto_accept_idx
  ON public.merchant_store_settings (store_id)
  WHERE auto_accept_orders = TRUE;

COMMENT ON INDEX public.orders_food_merchant_unaccepted_created_idx IS
  'Cron: find CREATED food orders eligible for server-side auto-accept per store.';

COMMENT ON INDEX public.merchant_store_settings_auto_accept_idx IS
  'Cron: stores with auto_accept_orders enabled for order-auto-accept tick.';
