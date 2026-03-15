-- Migration: Update Subscriptions Table for Auto-Pay System
-- Purpose: Add auto-pay tracking fields and update defaults
-- Date: 2026-02-17

-- ============================================
-- UPDATE MERCHANT_SUBSCRIPTIONS TABLE
-- ============================================

-- Change auto_renew default to false
ALTER TABLE public.merchant_subscriptions 
  ALTER COLUMN auto_renew SET DEFAULT false;

-- Add auto-pay related fields (using IF NOT EXISTS to avoid errors if columns already exist)
ALTER TABLE public.merchant_subscriptions
  ADD COLUMN IF NOT EXISTS auto_pay_enabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS auto_pay_disabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_auto_pay_attempt TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS auto_pay_failure_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT, -- For recurring subscriptions
  ADD COLUMN IF NOT EXISTS payment_method TEXT, -- e.g., 'RAZORPAY', 'CARD', 'UPI', 'NETBANKING'
  ADD COLUMN IF NOT EXISTS payment_method_details JSONB DEFAULT '{}'::jsonb, -- Store payment method details securely
  ADD COLUMN IF NOT EXISTS auto_pay_enabled_by BIGINT, -- User ID who enabled auto-pay
  ADD COLUMN IF NOT EXISTS auto_pay_disabled_by BIGINT, -- User ID who disabled auto-pay
  ADD COLUMN IF NOT EXISTS next_auto_pay_date TIMESTAMP WITH TIME ZONE; -- When next auto-pay will be attempted

-- Add indexes for auto-pay queries
CREATE INDEX IF NOT EXISTS merchant_subscriptions_auto_renew_idx 
  ON public.merchant_subscriptions(auto_renew) 
  WHERE auto_renew = true AND is_active = true;

CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_billing_date_idx 
  ON public.merchant_subscriptions(next_billing_date) 
  WHERE auto_renew = true AND is_active = true AND subscription_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_auto_pay_date_idx 
  ON public.merchant_subscriptions(next_auto_pay_date) 
  WHERE auto_renew = true AND is_active = true;

CREATE INDEX IF NOT EXISTS merchant_subscriptions_razorpay_subscription_id_idx 
  ON public.merchant_subscriptions(razorpay_subscription_id) 
  WHERE razorpay_subscription_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.merchant_subscriptions.auto_renew IS 'Whether subscription will auto-renew when it expires';
COMMENT ON COLUMN public.merchant_subscriptions.auto_pay_enabled_at IS 'Timestamp when auto-pay was first enabled';
COMMENT ON COLUMN public.merchant_subscriptions.auto_pay_disabled_at IS 'Timestamp when auto-pay was disabled';
COMMENT ON COLUMN public.merchant_subscriptions.last_auto_pay_attempt IS 'Last time auto-pay was attempted';
COMMENT ON COLUMN public.merchant_subscriptions.auto_pay_failure_count IS 'Number of consecutive auto-pay failures';
COMMENT ON COLUMN public.merchant_subscriptions.razorpay_customer_id IS 'Razorpay customer ID for recurring payments';
COMMENT ON COLUMN public.merchant_subscriptions.razorpay_subscription_id IS 'Razorpay subscription ID for recurring payments';
COMMENT ON COLUMN public.merchant_subscriptions.payment_method IS 'Payment method used for auto-pay';
COMMENT ON COLUMN public.merchant_subscriptions.payment_method_details IS 'Encrypted payment method details (card last 4 digits, etc.)';
COMMENT ON COLUMN public.merchant_subscriptions.next_auto_pay_date IS 'Next scheduled date for auto-pay attempt';

-- ============================================
-- UPDATE EXISTING RECORDS
-- ============================================

-- Ensure existing subscriptions with auto_renew=true have next_billing_date set
-- If next_billing_date is NULL, set it to expiry_date
UPDATE public.merchant_subscriptions 
SET next_billing_date = expiry_date
WHERE auto_renew = true 
  AND next_billing_date IS NULL 
  AND expiry_date IS NOT NULL;

-- Set auto_renew to false for existing subscriptions that don't have next_billing_date
-- This ensures data consistency before adding constraint
UPDATE public.merchant_subscriptions 
SET auto_renew = false
WHERE auto_renew = true 
  AND next_billing_date IS NULL;

-- ============================================
-- ADD CONSTRAINT FOR AUTO-PAY (Optional)
-- ============================================

-- Note: This constraint ensures next_billing_date is set when auto_renew is true
-- This is enforced at application level, but can also be enforced at DB level
-- Drop constraint if it exists, then add it
DO $$ 
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'auto_renew_next_billing_check'
    AND conrelid = 'public.merchant_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.merchant_subscriptions 
      DROP CONSTRAINT auto_renew_next_billing_check;
  END IF;
  
  -- Add constraint (only if no rows violate it)
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_subscriptions
    WHERE auto_renew = true AND next_billing_date IS NULL
  ) THEN
    ALTER TABLE public.merchant_subscriptions
      ADD CONSTRAINT auto_renew_next_billing_check 
      CHECK (
        (auto_renew = false) OR 
        (auto_renew = true AND next_billing_date IS NOT NULL)
      );
  ELSE
    RAISE NOTICE 'Skipping constraint addition: existing rows violate the constraint';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint already exists or other error, just continue
    RAISE NOTICE 'Constraint auto_renew_next_billing_check error: %', SQLERRM;
END $$;
