-- GST on store onboarding payment: configurable rate + audit columns on payment rows.

ALTER TABLE public.store_onboarding_commission_config
  ADD COLUMN IF NOT EXISTS gst_percent numeric(6, 2) NOT NULL DEFAULT 18;

COMMENT ON COLUMN public.store_onboarding_commission_config.gst_percent IS 'GST % applied on discounted onboarding fee (0 = no GST).';

ALTER TABLE public.merchant_onboarding_payments
  ADD COLUMN IF NOT EXISTS subtotal_paise integer NULL,
  ADD COLUMN IF NOT EXISTS gst_percent_applied numeric(6, 2) NULL,
  ADD COLUMN IF NOT EXISTS gst_amount_paise integer NULL;

COMMENT ON COLUMN public.merchant_onboarding_payments.subtotal_paise IS 'Discounted onboarding fee in paise before GST.';
COMMENT ON COLUMN public.merchant_onboarding_payments.gst_percent_applied IS 'GST % applied at checkout.';
COMMENT ON COLUMN public.merchant_onboarding_payments.gst_amount_paise IS 'GST amount in paise; amount_paise should equal subtotal_paise + gst_amount_paise.';
