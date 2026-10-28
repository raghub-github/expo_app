-- 0645_first_order_free_delivery_safety.sql
-- First-order Free Delivery: benefit_family column, one-time unique lock,
-- and safe (idempotent) configuration of the existing FOOD FREE_DELIVERY offer.
--
-- BACKWARD COMPATIBLE: additive column + partial unique index + conditional UPDATE.
-- Does NOT truncate, drop, or reset budget_used / historical usages.
--
-- PRODUCTION: apply only through the authorized migration process.
-- Review the UPDATE preview queries before executing in production.

BEGIN;

-- 1) Denormalized benefit family for cross-campaign one-time locks
ALTER TABLE public.platform_offer_usages
  ADD COLUMN IF NOT EXISTS benefit_family text;

COMMENT ON COLUMN public.platform_offer_usages.benefit_family IS
  'Shared promotion identity (e.g. first_order_free_delivery). Partial unique index enforces one active redemption per customer.';

-- 2) Backfill benefit_family on existing first-order FREE_DELIVERY usages (non-destructive)
UPDATE public.platform_offer_usages u
SET benefit_family = 'first_order_free_delivery'
FROM public.billing_platform_offers o
WHERE o.id = u.platform_offer_id
  AND u.benefit_family IS NULL
  AND UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
  AND (
    UPPER(COALESCE(o.customer_segment, 'ALL')) = 'NEW'
    OR COALESCE(o.conditions->>'first_order_only', 'false') IN ('true', '1')
    OR COALESCE(o.conditions->>'benefit_family', '') = 'first_order_free_delivery'
  );

-- 3) Detect duplicate active redemptions before unique index (report only — do not auto-delete)
-- SELECT customer_id, benefit_family, COUNT(*)
-- FROM platform_offer_usages
-- WHERE status IN ('reserved', 'consumed') AND benefit_family IS NOT NULL
-- GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- Keep the oldest active usage; mark extras cancelled with audit (only when duplicates exist)
WITH dups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id, benefit_family
      ORDER BY applied_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.platform_offer_usages
  WHERE status IN ('reserved', 'consumed')
    AND benefit_family IS NOT NULL
)
UPDATE public.platform_offer_usages u
SET
  status = 'cancelled',
  cancelled_at = COALESCE(u.cancelled_at, now()),
  updated_at = now(),
  metadata = COALESCE(u.metadata, '{}'::jsonb) || jsonb_build_object(
    'audit_event', 'dedupe_benefit_family_pre_unique',
    'audit_at', now()
  )
FROM dups
WHERE u.id = dups.id
  AND dups.rn > 1;

-- 4) One active redemption per customer per benefit family
CREATE UNIQUE INDEX IF NOT EXISTS platform_offer_usages_benefit_family_customer_active_uidx
  ON public.platform_offer_usages (customer_id, benefit_family)
  WHERE status IN ('reserved', 'consumed') AND benefit_family IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_offer_usages_benefit_family_idx
  ON public.platform_offer_usages (benefit_family)
  WHERE benefit_family IS NOT NULL;

-- 5) Correct existing Free Delivery Fee / first-order FOOD FREE_DELIVERY offer in place
--    Preserves id, budget_used, and redemption history. Does not create a duplicate campaign.
--    Skips if FIRSTDELIVERY coupon already belongs to a different offer.
UPDATE public.billing_platform_offers o
SET
  name = 'Free Delivery -- First Order',
  coupon_code = CASE
    WHEN o.coupon_code IS NULL
      OR UPPER(BTRIM(o.coupon_code)) IN ('', 'FREEDELIVERYFEE', 'FREEDELIVERY', 'FIRSTDELIVERY')
      THEN 'FIRSTDELIVERY'
    ELSE o.coupon_code
  END,
  service_type = 'FOOD',
  offer_kind = 'FREE_DELIVERY',
  offer_audience = 'CUSTOMER',
  customer_segment = 'NEW',
  delivery_discount_type = 'FULL_WAIVE',
  min_order_amount = COALESCE(NULLIF(o.min_order_amount, 0), 99),
  max_uses_per_user = 1,
  is_stackable = false,
  restore_on_cancel = false,
  restore_on_refund = false,
  promo_config = COALESCE(o.promo_config, '{}'::jsonb) || jsonb_build_object('auto_apply', true),
  conditions = COALESCE(o.conditions, '{}'::jsonb) || jsonb_build_object(
    'first_order_only', true,
    'benefit_family', 'first_order_free_delivery'
  ),
  budget_total = COALESCE(o.budget_total, 1500),
  updated_at = now()
WHERE o.id = (
  SELECT id FROM public.billing_platform_offers
  WHERE UPPER(COALESCE(offer_kind, '')) = 'FREE_DELIVERY'
    AND UPPER(COALESCE(service_type, 'FOOD')) IN ('FOOD', 'ALL')
    AND (
      LOWER(BTRIM(COALESCE(name, ''))) IN (
        'free delivery fee',
        'free delivery -- first order',
        'free delivery - first order',
        'free delivery first order'
      )
      OR UPPER(BTRIM(COALESCE(coupon_code, ''))) IN (
        'FREEDELIVERYFEE', 'FREEDELIVERY', 'FIRSTDELIVERY'
      )
      OR UPPER(COALESCE(customer_segment, '')) = 'NEW'
    )
  ORDER BY
    CASE WHEN LOWER(BTRIM(COALESCE(name, ''))) LIKE '%first%order%' THEN 0 ELSE 1 END,
    id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.billing_platform_offers x
  WHERE x.id <> o.id
    AND LOWER(BTRIM(COALESCE(x.coupon_code, ''))) = 'firstdelivery'
);

COMMIT;

-- Validation (run after apply):
-- SELECT id, name, coupon_code, offer_kind, customer_segment, delivery_discount_type,
--        min_order_amount, max_uses_per_user, is_stackable, restore_on_cancel, restore_on_refund,
--        budget_total, budget_used, promo_config, conditions, is_active
-- FROM billing_platform_offers
-- WHERE UPPER(offer_kind) = 'FREE_DELIVERY';
--
-- SELECT COUNT(*) FILTER (WHERE benefit_family = 'first_order_free_delivery') AS fd_family_rows,
--        COUNT(*) AS total_usages
-- FROM platform_offer_usages;
