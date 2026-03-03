-- Industry-grade order schema: core_orders (master), core_order_items, core_order_item_addons, core_payments.
-- Frontend never writes to orders_food; trigger pushes from core_orders after insert.

-- 1) Master order record (customer order snapshot – never change after place)
CREATE TABLE IF NOT EXISTS public.core_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,

  customer_id BIGINT NOT NULL,
  merchant_store_id BIGINT NOT NULL,
  merchant_parent_id BIGINT,

  order_type TEXT NOT NULL DEFAULT 'FOOD',

  current_status TEXT NOT NULL DEFAULT 'PLACED',

  -- Pricing snapshot
  item_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  addon_total NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  platform_fee NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL,

  currency TEXT DEFAULT 'INR',

  -- Address snapshot
  pickup_address_normalized TEXT,
  pickup_address_geocoded JSONB,
  pickup_lat NUMERIC(9,6),
  pickup_lon NUMERIC(9,6),

  drop_address_normalized TEXT,
  drop_address_geocoded JSONB,
  drop_lat NUMERIC(9,6),
  drop_lon NUMERIC(9,6),
  delivery_address TEXT,

  distance_km NUMERIC(8,2),

  payment_status TEXT DEFAULT 'PENDING',
  payment_method TEXT,

  special_instruction TEXT,

  placed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT core_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS core_orders_order_id_idx ON public.core_orders(order_id);
CREATE INDEX IF NOT EXISTS core_orders_customer_id_idx ON public.core_orders(customer_id);
CREATE INDEX IF NOT EXISTS core_orders_merchant_store_id_idx ON public.core_orders(merchant_store_id);
CREATE INDEX IF NOT EXISTS core_orders_placed_at_idx ON public.core_orders(placed_at DESC);

COMMENT ON TABLE public.core_orders IS 'Master customer order record; snapshot never changes after place.';
COMMENT ON COLUMN public.core_orders.merchant_store_id IS 'Store id from Supabase merchant_stores; no FK in this DB.';

-- Drop FK if it exists (e.g. from earlier 0081 run); stores live in Supabase so this DB must not enforce it.
ALTER TABLE public.core_orders DROP CONSTRAINT IF EXISTS core_orders_merchant_store_id_fkey;

-- 2) Order line items (each item + variant; full snapshot)
CREATE TABLE IF NOT EXISTS public.core_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,

  menu_item_id BIGINT NOT NULL,
  item_name TEXT NOT NULL,

  category_name TEXT,
  veg_nonveg TEXT,

  variant_id BIGINT,
  variant_name TEXT,

  quantity INTEGER NOT NULL,
  base_price NUMERIC(12,2) NOT NULL,

  addon_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL,

  item_snapshot JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT core_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES core_orders(order_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS core_order_items_order_id_idx ON public.core_order_items(order_id);
CREATE INDEX IF NOT EXISTS core_order_items_menu_item_id_idx ON public.core_order_items(menu_item_id);

COMMENT ON TABLE public.core_order_items IS 'Per-line item with variant; snapshot at order time.';

-- 3) Addons per item
CREATE TABLE IF NOT EXISTS public.core_order_item_addons (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL,

  addon_id BIGINT,
  addon_name TEXT,
  addon_price NUMERIC(12,2),
  quantity INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT core_order_item_addons_order_item_id_fkey
    FOREIGN KEY (order_item_id) REFERENCES core_order_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS core_order_item_addons_order_item_id_idx ON public.core_order_item_addons(order_item_id);

COMMENT ON TABLE public.core_order_item_addons IS 'Addon breakdown per order line item.';

-- 4) Payment ledger (never store payment only in orders)
CREATE TABLE IF NOT EXISTS public.core_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT,

  payment_gateway TEXT,
  payment_method TEXT,
  transaction_id TEXT,

  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',

  payment_status TEXT DEFAULT 'INITIATED',

  gateway_response JSONB,

  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT core_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES core_orders(order_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS core_payments_order_id_idx ON public.core_payments(order_id);
CREATE INDEX IF NOT EXISTS core_payments_transaction_id_idx ON public.core_payments(transaction_id) WHERE transaction_id IS NOT NULL;

COMMENT ON TABLE public.core_payments IS 'Payment record per order; financial ledger.';
