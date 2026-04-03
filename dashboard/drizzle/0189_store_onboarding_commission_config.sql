-- Singleton config for merchant store registration "Commission plan" (onboarding fee, service fee %, copy, features).

CREATE TABLE IF NOT EXISTS public.store_onboarding_commission_config (
  id smallint PRIMARY KEY DEFAULT 1,
  CONSTRAINT store_onboarding_commission_config_singleton CHECK (id = 1),
  plan_name text NOT NULL,
  show_recommended_badge boolean NOT NULL DEFAULT true,
  standard_onboarding_fee numeric(12, 2) NOT NULL,
  discounted_onboarding_fee numeric(12, 2) NOT NULL,
  discount_percent numeric(6, 2) NOT NULL,
  base_service_fee_percent numeric(6, 2) NOT NULL,
  discount_period_label text NOT NULL DEFAULT 'for limited time',
  base_service_fee_period_label text NOT NULL DEFAULT 'for initial period',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  alert_notice text NOT NULL,
  footer_note text NOT NULL,
  support_contact text NOT NULL,
  pay_button_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.store_onboarding_commission_config (
  id,
  plan_name,
  show_recommended_badge,
  standard_onboarding_fee,
  discounted_onboarding_fee,
  discount_percent,
  base_service_fee_percent,
  discount_period_label,
  base_service_fee_period_label,
  features,
  alert_notice,
  footer_note,
  support_contact,
  pay_button_text
)
VALUES (
  1,
  'Starter Plan',
  true,
  99,
  1,
  99,
  0,
  'for limited time',
  'for initial period',
  '[
    "Onboarding fee: ₹1 out of ₹99 — 99% discount for limited time (standard amount configurable by platform)",
    "Base service fee 0% for initial period",
    "Real-time on-call support",
    "Weekly or daily payouts",
    "Full access to partner dashboard"
  ]'::jsonb,
  'Pay ₹1 to proceed (₹99 value — 99% discount for limited time). Contract and agreement will be shown on the next step. You will need to read the full contract and sign digitally before submission.',
  'The commission structure is transparent and fair. You will receive monthly statements detailing all deductions.',
  'Contact our support team through the partner dashboard if you have questions about fees or payouts.',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- To change values after the row exists, use UPDATE or an UPSERT (see 0190_store_onboarding_commission_gmitra_prime.sql).
