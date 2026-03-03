-- ============================================================================
-- Optional: Make order_refunds.order_id reference orders_core(id) so that
-- dashboard (which uses orders_core.id) can create refunds without FK failure.
-- Run this only if order_refunds currently references orders(id) and your
-- app uses orders_core as the source of order ids.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_refunds')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders_core') THEN

    ALTER TABLE public.order_refunds
      DROP CONSTRAINT IF EXISTS order_refunds_order_id_fkey;

    ALTER TABLE public.order_refunds
      ADD CONSTRAINT order_refunds_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders_core(id) ON DELETE CASCADE;
  END IF;
END $$;
