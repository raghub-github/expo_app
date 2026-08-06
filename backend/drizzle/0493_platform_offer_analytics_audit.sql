-- Platform offer analytics enrichment: freeze order sale on usage rows + indexes.
-- Idempotent / production-safe. Mirror: dashboard/drizzle/0483_platform_offer_analytics_audit.sql

ALTER TABLE public.platform_offer_usages
  ADD COLUMN IF NOT EXISTS order_sale_amount numeric(14, 4);

COMMENT ON COLUMN public.platform_offer_usages.order_sale_amount IS
  'Order grand total (INR) at redemption time — used for offer sales analytics.';

UPDATE public.platform_offer_usages u
SET order_sale_amount = oc.grand_total
FROM public.orders_core oc
WHERE u.order_id = oc.id
  AND u.order_sale_amount IS NULL
  AND oc.grand_total IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_offer_usages_offer_applied_idx
  ON public.platform_offer_usages (platform_offer_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS offer_order_applications_platform_created_idx
  ON public.offer_order_applications (platform_offer_id, created_at DESC)
  WHERE offer_source = 'PLATFORM' AND platform_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS action_audit_log_platform_offer_idx
  ON public.action_audit_log (resource_type, created_at DESC)
  WHERE resource_type IN ('platform_offer', 'geo_platform_offer_binding');
