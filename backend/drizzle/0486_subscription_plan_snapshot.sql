-- =============================================================================
-- 0486_subscription_plan_snapshot.sql
-- =============================================================================
-- Preserve plan catalog details at purchase / activation time so admin changes
-- to merchant_plans (price, name, validity, benefits) never rewrite history.
--
-- Money already snapshotted on subscription_payments (amount, GST, total_paise,
-- billing_period_*). This adds immutable plan identity + list-price + benefits.
-- =============================================================================

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS plan_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plan_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plan_list_price_paise BIGINT,
  ADD COLUMN IF NOT EXISTS plan_benefits_snapshot JSONB;

COMMENT ON COLUMN public.subscription_payments.plan_name_snapshot IS
  'Plan name at purchase time — immutable history.';
COMMENT ON COLUMN public.subscription_payments.plan_code_snapshot IS
  'Plan code at purchase time — immutable history.';
COMMENT ON COLUMN public.subscription_payments.billing_cycle_snapshot IS
  'Billing cycle label at purchase time (MONTHLY/QUARTERLY/YEARLY/…).';
COMMENT ON COLUMN public.subscription_payments.plan_list_price_paise IS
  'Catalog list price (paise, ex-GST) at purchase time — not the charged total.';
COMMENT ON COLUMN public.subscription_payments.plan_benefits_snapshot IS
  'Optional benefits_json copy from merchant_plans at purchase time.';

ALTER TABLE public.merchant_subscriptions
  ADD COLUMN IF NOT EXISTS plan_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plan_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plan_list_price_paise BIGINT,
  ADD COLUMN IF NOT EXISTS plan_benefits_snapshot JSONB;

COMMENT ON COLUMN public.merchant_subscriptions.plan_name_snapshot IS
  'Plan name at activation/upgrade — immutable for this entitlement row.';
COMMENT ON COLUMN public.merchant_subscriptions.plan_code_snapshot IS
  'Plan code at activation/upgrade.';
COMMENT ON COLUMN public.merchant_subscriptions.billing_cycle_snapshot IS
  'Billing cycle at activation/upgrade.';
COMMENT ON COLUMN public.merchant_subscriptions.plan_list_price_paise IS
  'Catalog list price (paise, ex-GST) at activation/upgrade.';
COMMENT ON COLUMN public.merchant_subscriptions.plan_benefits_snapshot IS
  'benefits_json snapshot at activation/upgrade.';

-- Best-effort backfill from current catalog (cannot recover pre-edit values).
UPDATE public.subscription_payments sp
SET
  plan_name_snapshot = COALESCE(sp.plan_name_snapshot, p.plan_name),
  plan_code_snapshot = COALESCE(sp.plan_code_snapshot, p.plan_code),
  billing_cycle_snapshot = COALESCE(sp.billing_cycle_snapshot, p.billing_cycle::text),
  plan_list_price_paise = COALESCE(
    sp.plan_list_price_paise,
    CASE
      WHEN p.price IS NULL THEN NULL
      ELSE ROUND(p.price::numeric * 100)::bigint
    END
  ),
  plan_benefits_snapshot = COALESCE(sp.plan_benefits_snapshot, p.benefits_json)
FROM public.merchant_plans p
WHERE p.id = sp.plan_id
  AND (
    sp.plan_name_snapshot IS NULL
    OR sp.plan_code_snapshot IS NULL
    OR sp.billing_cycle_snapshot IS NULL
    OR sp.plan_list_price_paise IS NULL
    OR sp.plan_benefits_snapshot IS NULL
  );

UPDATE public.merchant_subscriptions ms
SET
  plan_name_snapshot = COALESCE(ms.plan_name_snapshot, p.plan_name),
  plan_code_snapshot = COALESCE(ms.plan_code_snapshot, p.plan_code),
  billing_cycle_snapshot = COALESCE(ms.billing_cycle_snapshot, p.billing_cycle::text),
  plan_list_price_paise = COALESCE(
    ms.plan_list_price_paise,
    CASE
      WHEN p.price IS NULL THEN NULL
      ELSE ROUND(p.price::numeric * 100)::bigint
    END
  ),
  plan_benefits_snapshot = COALESCE(ms.plan_benefits_snapshot, p.benefits_json)
FROM public.merchant_plans p
WHERE p.id = ms.plan_id
  AND (
    ms.plan_name_snapshot IS NULL
    OR ms.plan_code_snapshot IS NULL
    OR ms.billing_cycle_snapshot IS NULL
    OR ms.plan_list_price_paise IS NULL
    OR ms.plan_benefits_snapshot IS NULL
  );
