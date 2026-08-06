-- Rollback: platform offer usage engine

DROP INDEX IF EXISTS public.platform_offer_usages_offer_status_applied_idx;
DROP INDEX IF EXISTS public.platform_offer_usages_customer_status_idx;
DROP INDEX IF EXISTS public.platform_offer_usages_offer_customer_idx;
DROP INDEX IF EXISTS public.platform_offer_usages_offer_order_text_uidx;
DROP INDEX IF EXISTS public.platform_offer_usages_offer_order_uidx;
DROP TABLE IF EXISTS public.platform_offer_usages;

ALTER TABLE public.billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_budget_used_cap_chk;

ALTER TABLE public.billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_budget_used_nonneg_chk;

ALTER TABLE public.billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_consume_mode_chk;

ALTER TABLE public.billing_platform_offers
  DROP COLUMN IF EXISTS restore_on_refund,
  DROP COLUMN IF EXISTS restore_on_cancel,
  DROP COLUMN IF EXISTS consume_mode,
  DROP COLUMN IF EXISTS max_uses_per_month,
  DROP COLUMN IF EXISTS max_uses_per_day,
  DROP COLUMN IF EXISTS max_uses_per_user,
  DROP COLUMN IF EXISTS max_uses_total;
