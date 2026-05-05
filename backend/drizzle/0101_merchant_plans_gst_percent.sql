-- Add per-plan GST % for subscription fees (controlled from Subscription Plans admin page).

ALTER TABLE public.merchant_plans
  ADD COLUMN IF NOT EXISTS gst_percent numeric(6, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.merchant_plans.gst_percent IS 'GST % applied on this plan subscription fee (0 = no GST).';

