-- Rollback: Platform checkout coupon engine (0486 / 0496).
-- Safe to run when rolling back coupon_config + geo coupon bindings + usage ledger.
-- Does not touch store / merchant offer tables.

DROP INDEX IF EXISTS public.billing_discount_usages_applied_at_idx;
DROP INDEX IF EXISTS public.billing_discount_usages_customer_status_idx;
DROP INDEX IF EXISTS public.billing_discount_usages_discount_customer_idx;
DROP INDEX IF EXISTS public.billing_discount_usages_discount_order_text_uidx;
DROP INDEX IF EXISTS public.billing_discount_usages_discount_order_uidx;
DROP TABLE IF EXISTS public.billing_discount_usages;

DROP FUNCTION IF EXISTS public.geo_billing_discount_ids_effective_for_location(geo_pricing_level, uuid);

DROP INDEX IF EXISTS public.geo_billing_discount_bindings_discount_idx;
DROP INDEX IF EXISTS public.geo_billing_discount_bindings_geo_idx;
DROP TABLE IF EXISTS public.geo_billing_discount_bindings;

ALTER TABLE public.billing_discounts
  DROP COLUMN IF EXISTS coupon_config;
