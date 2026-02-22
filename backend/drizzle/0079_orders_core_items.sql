-- orders_core.items: line items snapshot at order time (e.g. food cart)
ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS items JSONB NULL;

COMMENT ON COLUMN public.orders_core.items IS 'Order line items snapshot at place time (e.g. menu_item_id, quantity, price).';
