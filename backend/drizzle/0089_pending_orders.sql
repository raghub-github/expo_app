-- Payment-first order flow: pending orders hold cart + address snapshot until payment succeeds.
-- Finalize (after payment verification) moves data into core_orders in one transaction.

CREATE TABLE IF NOT EXISTS public.pending_orders (
  id BIGSERIAL PRIMARY KEY,
  pending_id TEXT NOT NULL UNIQUE,

  customer_id BIGINT NOT NULL,
  merchant_store_id BIGINT NOT NULL,
  merchant_parent_id BIGINT,

  -- Snapshot (same shape as create-order body)
  items_snapshot JSONB NOT NULL,
  address_id_used BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  donation_amount NUMERIC(12,2) DEFAULT 0,

  -- Computed at create-pending
  item_total NUMERIC(12,2) NOT NULL,
  addon_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',

  -- Address snapshot (normalized)
  delivery_address TEXT,
  drop_lat NUMERIC(9,6),
  drop_lon NUMERIC(9,6),
  pickup_address_normalized TEXT,
  pickup_lat NUMERIC(9,6),
  pickup_lon NUMERIC(9,6),
  distance_km NUMERIC(8,2),

  -- Razorpay: set when client starts payment
  razorpay_order_id TEXT,

  -- Idempotency: when finalize succeeds, we set finalized_order_id so duplicate callbacks return same order
  finalized_order_id TEXT,
  finalized_at TIMESTAMPTZ,

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pending_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pending_orders_pending_id_idx ON public.pending_orders(pending_id);
CREATE INDEX IF NOT EXISTS pending_orders_customer_id_idx ON public.pending_orders(customer_id);
CREATE INDEX IF NOT EXISTS pending_orders_razorpay_order_id_idx ON public.pending_orders(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pending_orders_finalized_order_id_idx ON public.pending_orders(finalized_order_id) WHERE finalized_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pending_orders_expires_at_idx ON public.pending_orders(expires_at);

COMMENT ON TABLE public.pending_orders IS 'Locked cart + address until payment success; finalize creates core_orders in one tx.';
