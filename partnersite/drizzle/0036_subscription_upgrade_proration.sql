-- Migration: Subscription upgrade with proration (one active per store, UPGRADED status)
-- Purpose: Support SaaS-style plan upgrades with credit for unused time
-- Date: 2026-02-18

-- Add UPGRADED to subscription_status_type enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'UPGRADED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'subscription_status_type')
  ) THEN
    ALTER TYPE subscription_status_type ADD VALUE 'UPGRADED';
  END IF;
END $$;

-- Add upgrade tracking columns to merchant_subscriptions
ALTER TABLE public.merchant_subscriptions
  ADD COLUMN IF NOT EXISTS upgraded_from BIGINT NULL,
  ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_start_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS billing_end_at TIMESTAMP WITH TIME ZONE;

-- Ensure cancelled_at exists (already in 0022)
-- ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Comment new columns
COMMENT ON COLUMN public.merchant_subscriptions.upgraded_from IS 'Previous subscription id when this subscription was created via upgrade';
COMMENT ON COLUMN public.merchant_subscriptions.credit_applied IS 'Credit from previous plan proration applied to this subscription';
COMMENT ON COLUMN public.merchant_subscriptions.billing_start_at IS 'Start of current billing period';
COMMENT ON COLUMN public.merchant_subscriptions.billing_end_at IS 'End of current billing period';

-- One ACTIVE subscription per (merchant_id, store_id). Use COALESCE(store_id, -1) so NULL store_id is unique per merchant.
DROP INDEX IF EXISTS public.one_active_subscription_per_store;
CREATE UNIQUE INDEX one_active_subscription_per_store
  ON public.merchant_subscriptions(merchant_id, (COALESCE(store_id, -1)))
  WHERE subscription_status = 'ACTIVE';
