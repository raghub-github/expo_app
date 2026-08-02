-- Rollback 0488 (comment only)

COMMENT ON COLUMN merchant_store_settings.show_floating_orders IS
  'When TRUE, merchant app may show a floating active orders counter overlay for this store. Controlled from store preferences.';
