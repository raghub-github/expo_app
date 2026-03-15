-- ============================================================================
-- Make order_cancellation_reasons.order_id reference orders_core(id) so that
-- dashboard (which uses orders_core.id) can insert cancellation reasons without
-- FK failure. Run when order_cancellation_reasons currently references orders(id).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_cancellation_reasons')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders_core') THEN

    ALTER TABLE public.order_cancellation_reasons
      DROP CONSTRAINT IF EXISTS order_cancellation_reasons_order_id_fkey;

    ALTER TABLE public.order_cancellation_reasons
      ADD CONSTRAINT order_cancellation_reasons_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders_core(id) ON DELETE CASCADE;
  END IF;
END $$;
