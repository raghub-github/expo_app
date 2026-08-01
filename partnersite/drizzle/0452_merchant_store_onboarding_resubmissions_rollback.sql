-- Rollback: 0452_merchant_store_onboarding_resubmissions

BEGIN;

DROP INDEX IF EXISTS public.merchant_store_onboarding_resubmissions_step_pending_idx;
DROP INDEX IF EXISTS public.merchant_store_onboarding_resubmissions_store_pending_idx;
DROP INDEX IF EXISTS public.merchant_store_onboarding_resubmissions_pending_uniq;
DROP TABLE IF EXISTS public.merchant_store_onboarding_resubmissions;

COMMIT;
