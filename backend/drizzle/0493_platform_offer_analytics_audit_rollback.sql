-- Rollback: platform offer analytics enrichment

DROP INDEX IF EXISTS public.action_audit_log_platform_offer_idx;
DROP INDEX IF EXISTS public.offer_order_applications_platform_created_idx;
DROP INDEX IF EXISTS public.platform_offer_usages_offer_applied_idx;

ALTER TABLE public.platform_offer_usages
  DROP COLUMN IF EXISTS order_sale_amount;
