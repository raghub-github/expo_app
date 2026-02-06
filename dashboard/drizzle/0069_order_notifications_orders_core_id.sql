-- ============================================================================
-- Order Notifications: optional orders_core_id for hybrid migration
-- Migration: 0069_order_notifications_orders_core_id
--
-- order_notifications already exists (0008) and references orders(id).
-- Add optional order_core_id so notifications can link to orders_core
-- during/after migration. After cutover, queries use order_core_id.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_notifications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_notifications' AND column_name = 'order_core_id') THEN
      ALTER TABLE order_notifications
        ADD COLUMN order_core_id BIGINT REFERENCES orders_core(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS order_notifications_order_core_id_idx ON order_notifications(order_core_id) WHERE order_core_id IS NOT NULL;
      COMMENT ON COLUMN order_notifications.order_core_id IS 'Link to orders_core after hybrid migration; use for new orders.';
    END IF;
  END IF;
END $$;
