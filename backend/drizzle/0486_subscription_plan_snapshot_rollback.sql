-- Rollback 0486 — drop plan snapshot columns (history falls back to live joins).
ALTER TABLE public.subscription_payments
  DROP COLUMN IF EXISTS plan_name_snapshot,
  DROP COLUMN IF EXISTS plan_code_snapshot,
  DROP COLUMN IF EXISTS billing_cycle_snapshot,
  DROP COLUMN IF EXISTS plan_list_price_paise,
  DROP COLUMN IF EXISTS plan_benefits_snapshot;

ALTER TABLE public.merchant_subscriptions
  DROP COLUMN IF EXISTS plan_name_snapshot,
  DROP COLUMN IF EXISTS plan_code_snapshot,
  DROP COLUMN IF EXISTS billing_cycle_snapshot,
  DROP COLUMN IF EXISTS plan_list_price_paise,
  DROP COLUMN IF EXISTS plan_benefits_snapshot;
