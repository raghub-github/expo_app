-- ============================================================================
-- 0121_merchant_store_settings_floating_orders
-- Add per-store toggle for floating active orders counter in merchant app.
-- ============================================================================

ALTER TABLE merchant_store_settings
ADD COLUMN IF NOT EXISTS show_floating_orders BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN merchant_store_settings.show_floating_orders IS
  'When TRUE, merchant app may show a floating active orders counter overlay for this store (Android overlay bubble). Controlled from store preferences.';

