-- Rollback 0645_first_order_free_delivery_safety
-- Does NOT revert offer name/config edits (would risk wiping intentional admin changes).
-- Only drops the additive unique index + column if safe.

BEGIN;

DROP INDEX IF EXISTS public.platform_offer_usages_benefit_family_customer_active_uidx;
DROP INDEX IF EXISTS public.platform_offer_usages_benefit_family_idx;

-- Leave benefit_family column in place by default (non-destructive).
-- Uncomment to drop:
-- ALTER TABLE public.platform_offer_usages DROP COLUMN IF EXISTS benefit_family;

COMMIT;
