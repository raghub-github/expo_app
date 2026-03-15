-- ============================================================================
-- Make unified_tickets.order_id reference orders_core(id) so that
-- order-related tickets can link to orders_core (formatted_order_id = GMF100001 etc).
-- Run when unified_tickets currently references orders(id).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'unified_tickets')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders_core') THEN

    ALTER TABLE public.unified_tickets
      DROP CONSTRAINT IF EXISTS unified_tickets_order_id_fkey;

    ALTER TABLE public.unified_tickets
      ADD CONSTRAINT unified_tickets_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders_core(id) ON DELETE SET NULL;
  END IF;
END $$;
