-- ============================================================================
-- 0488_system_overlay_bubble (superseded — overlay bubble feature removed)
-- Keep as no-op so migration trackers that already applied 0488 stay valid.
-- ============================================================================

COMMENT ON COLUMN merchant_store_settings.show_floating_orders IS
  'When TRUE, merchant app may show the in-app floating pending-orders FAB for this store.';
