-- Rider onboarding fee config (super-admin) + GST audit columns on onboarding_payments.

CREATE TABLE IF NOT EXISTS public.rider_onboarding_commission_config (
  id smallint PRIMARY KEY DEFAULT 1,
  CONSTRAINT rider_onboarding_commission_config_singleton CHECK (id = 1),
  standard_onboarding_fee numeric(12, 2) NOT NULL,
  discounted_onboarding_fee numeric(12, 2) NOT NULL,
  discount_percent numeric(6, 2) NOT NULL,
  gst_percent numeric(6, 2) NOT NULL DEFAULT 18,
  discount_period_label text NOT NULL DEFAULT 'for limited time',
  headline text NOT NULL DEFAULT 'Onboarding Fee',
  subtitle text NOT NULL DEFAULT 'Complete your onboarding by paying the registration fee',
  fee_label text NOT NULL DEFAULT 'One-time onboarding fee',
  info_message text NOT NULL DEFAULT 'This fee covers document verification and account setup',
  alert_notice text NOT NULL DEFAULT 'Pay the onboarding fee to complete registration. Your application will be reviewed after payment.',
  footer_note text NOT NULL DEFAULT 'The onboarding fee is non-refundable once verification begins.',
  pay_button_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.rider_onboarding_commission_config (
  id,
  standard_onboarding_fee,
  discounted_onboarding_fee,
  discount_percent,
  gst_percent,
  discount_period_label,
  headline,
  subtitle,
  fee_label,
  info_message,
  alert_notice,
  footer_note,
  pay_button_text
)
VALUES (
  1,
  99,
  49,
  50.51,
  18,
  'for limited time',
  'Onboarding Fee',
  'Complete your onboarding by paying the registration fee',
  'One-time onboarding fee',
  'This fee covers document verification and account setup',
  'Pay the onboarding fee to complete registration. Your application will be reviewed after payment.',
  'The onboarding fee is non-refundable once verification begins.',
  NULL
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.rider_onboarding_commission_config IS 'Singleton config for rider app onboarding fee (amount, GST, copy).';

ALTER TABLE public.onboarding_payments
  ADD COLUMN IF NOT EXISTS subtotal_paise integer NULL,
  ADD COLUMN IF NOT EXISTS gst_percent_applied numeric(6, 2) NULL,
  ADD COLUMN IF NOT EXISTS gst_amount_paise integer NULL;

COMMENT ON COLUMN public.onboarding_payments.subtotal_paise IS 'Discounted onboarding fee in paise before GST.';
COMMENT ON COLUMN public.onboarding_payments.gst_percent_applied IS 'GST % applied at checkout.';
COMMENT ON COLUMN public.onboarding_payments.gst_amount_paise IS 'GST amount in paise; Razorpay total = subtotal_paise + gst_amount_paise.';
