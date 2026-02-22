-- Gratitude: store donation per order (e.g. Donate to Feeding India).
-- order_id can reference orders_core.id (food) or legacy orders.id when used.
CREATE TABLE IF NOT EXISTS public.order_donations (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL,
  donation_amount numeric(10, 2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_donations_order_id_idx ON public.order_donations (order_id);
COMMENT ON TABLE public.order_donations IS 'Per-order donation amounts (e.g. Feeding India); order_id = orders_core.id or orders.id.';
