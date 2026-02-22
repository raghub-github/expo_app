-- core_orders.merchant_store_id references store IDs from Supabase (merchant_stores there),
-- not from this DB. Drop the FK so order creation succeeds when stores exist only in Supabase.
ALTER TABLE IF EXISTS public.core_orders
  DROP CONSTRAINT IF EXISTS core_orders_merchant_store_id_fkey;

COMMENT ON COLUMN public.core_orders.merchant_store_id IS 'Store id from Supabase merchant_stores; no FK in this DB.';
