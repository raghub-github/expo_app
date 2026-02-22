-- ============================================================================
-- GROUP ORDERS (Restaurant-level group ordering, up to 50 members)
-- group_orders, group_order_members, group_order_items
-- ============================================================================

-- Unique public id for shareable links: gatimitra.app/group/{group_order_id}
CREATE TABLE IF NOT EXISTS public.group_orders (
  id BIGSERIAL PRIMARY KEY,
  group_order_id TEXT NOT NULL UNIQUE,
  store_id BIGINT NOT NULL,
  created_by_customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  delivery_address_id BIGINT REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'ORDER_PLACED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_orders_group_order_id ON public.group_orders(group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_orders_store_id ON public.group_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_group_orders_created_by ON public.group_orders(created_by_customer_id);
CREATE INDEX IF NOT EXISTS idx_group_orders_status ON public.group_orders(status);
CREATE INDEX IF NOT EXISTS idx_group_orders_expires_at ON public.group_orders(expires_at);

COMMENT ON TABLE public.group_orders IS 'Restaurant-level group orders; shareable link via group_order_id; max 30 members.';

-- Members who joined the group order
CREATE TABLE IF NOT EXISTS public.group_order_members (
  id BIGSERIAL PRIMARY KEY,
  group_order_id BIGINT NOT NULL REFERENCES public.group_orders(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_order_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_group_order_members_group_order_id ON public.group_order_members(group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_order_members_customer_id ON public.group_order_members(customer_id);

-- Line items per member (menu_item_id = merchant menu item id from store)
CREATE TABLE IF NOT EXISTS public.group_order_items (
  id BIGSERIAL PRIMARY KEY,
  group_order_id BIGINT NOT NULL REFERENCES public.group_orders(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_order_items_group_order_id ON public.group_order_items(group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_order_items_customer_id ON public.group_order_items(customer_id);

COMMENT ON TABLE public.group_order_items IS 'Per-member items in a group order; menu_item_id from merchant menu.';

-- Trigger to update updated_at on group_orders
CREATE OR REPLACE FUNCTION public.set_group_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_orders_updated_at ON public.group_orders;
CREATE TRIGGER group_orders_updated_at
  BEFORE UPDATE ON public.group_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_group_orders_updated_at();

-- Trigger for group_order_items
DROP TRIGGER IF EXISTS group_order_items_updated_at ON public.group_order_items;
CREATE TRIGGER group_order_items_updated_at
  BEFORE UPDATE ON public.group_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_group_orders_updated_at();
