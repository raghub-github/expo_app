-- core_orders.merchant_store_id references store IDs from Supabase (merchant_stores there),
-- not from this DB. Drop the FK so order creation succeeds when stores exist only in Supabase.
-- Skip if core_orders already dropped (e.g. after 0094).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_orders') THEN
    ALTER TABLE public.core_orders DROP CONSTRAINT IF EXISTS core_orders_merchant_store_id_fkey;
    EXECUTE 'COMMENT ON COLUMN public.core_orders.merchant_store_id IS ''Store id from Supabase merchant_stores; no FK in this DB.''' ;
  END IF;
END $$;
