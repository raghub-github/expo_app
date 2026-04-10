-- GMitra Prime copy for store onboarding commission (singleton id = 1).
-- Safe to re-run: uses UPSERT so it updates if the row already exists.
-- If you only need to change values in Supabase, use this pattern instead of INSERT.

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
  'GMitra Prime',
  true,
  199.00,
  19.00,
  90.00,
  0.00,
  'limited time offer',
  'introductory period',
  '[
    "Onboarding fee: ₹19 instead of ₹199 (90% discount for limited time)",
    "0% service fee during introductory period",
    "Priority onboarding & faster approvals",
    "Daily/weekly payout flexibility",
    "Advanced partner dashboard access",
    "Dedicated support assistance"
  ]'::jsonb,
  'Activate GMitra Prime for just ₹19 (original ₹199). Complete your onboarding and digitally sign the agreement in the next step to start receiving orders instantly.',
  'Transparent pricing with no hidden charges. Detailed earnings and deductions will be available in your dashboard.',
  'Need help? Reach out to our support team anytime directly from your dashboard.',
  'Activate Now'
)
ON CONFLICT (id) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  show_recommended_badge = EXCLUDED.show_recommended_badge,
  standard_onboarding_fee = EXCLUDED.standard_onboarding_fee,
  discounted_onboarding_fee = EXCLUDED.discounted_onboarding_fee,
  discount_percent = EXCLUDED.discount_percent,
  base_service_fee_percent = EXCLUDED.base_service_fee_percent,
  discount_period_label = EXCLUDED.discount_period_label,
  base_service_fee_period_label = EXCLUDED.base_service_fee_period_label,
  features = EXCLUDED.features,
  alert_notice = EXCLUDED.alert_notice,
  footer_note = EXCLUDED.footer_note,
  support_contact = EXCLUDED.support_contact,
  pay_button_text = EXCLUDED.pay_button_text,
  updated_at = now();
