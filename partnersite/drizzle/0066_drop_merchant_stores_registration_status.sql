-- Remove registration_status from merchant_stores (use onboarding_completed instead)
-- merchant_store_registration_progress.registration_status is KEPT (tracks progress flow)

-- 1. Drop index on registration_status if it exists (created by 0046)
DROP INDEX IF EXISTS public.merchant_stores_status_idx;

-- 2. Drop the column from merchant_stores
ALTER TABLE public.merchant_stores DROP COLUMN IF EXISTS registration_status;

-- Note: merchant_store_registration_progress.registration_status is unchanged (IN_PROGRESS, COMPLETED, DRAFT).
