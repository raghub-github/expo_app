-- Saved payment methods for checkout (UPI, cards, Pluxee).
CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
  id bigserial PRIMARY KEY,
  customer_id bigint NOT NULL,
  method_type text NOT NULL,
  provider text,
  upi_id text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_payment_methods_customer_id_idx ON public.customer_payment_methods (customer_id);
COMMENT ON TABLE public.customer_payment_methods IS 'Customer saved payment methods: UPI (provider, upi_id), cards, Pluxee.';
