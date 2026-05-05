-- GST on subscription fee payment: configurable rate + audit columns on payment rows.

-- Singleton config row (id = 1) controlled from Super Admin panel.
CREATE TABLE IF NOT EXISTS public.subscription_fee_tax_config (
  id smallint PRIMARY KEY DEFAULT 1,
  gst_percent numeric(6, 2) NOT NULL DEFAULT 18,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure singleton row exists.
INSERT INTO public.subscription_fee_tax_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.subscription_fee_tax_config IS 'Singleton (id=1) holding GST % for subscription fees.';
COMMENT ON COLUMN public.subscription_fee_tax_config.gst_percent IS 'GST % applied on subscription subtotal (0 = no GST).';

-- Add audit columns to subscription payment rows.
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS subtotal_paise integer NULL,
  ADD COLUMN IF NOT EXISTS gst_percent_applied numeric(6, 2) NULL,
  ADD COLUMN IF NOT EXISTS gst_amount_paise integer NULL,
  ADD COLUMN IF NOT EXISTS total_paise integer NULL;

COMMENT ON COLUMN public.subscription_payments.subtotal_paise IS 'Subtotal in paise before GST (after proration credits).';
COMMENT ON COLUMN public.subscription_payments.gst_percent_applied IS 'GST % applied at checkout.';
COMMENT ON COLUMN public.subscription_payments.gst_amount_paise IS 'GST amount in paise.';
COMMENT ON COLUMN public.subscription_payments.total_paise IS 'Total amount in paise (subtotal + GST).';

