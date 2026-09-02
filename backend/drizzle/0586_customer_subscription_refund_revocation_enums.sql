-- Step 1/2: add enum values (must commit before use — run before 0586_customer_subscription_refund_revocation.sql)
-- Migration: 0586_customer_subscription_refund_revocation_enums

DO $$ BEGIN
  ALTER TYPE public.customer_subscription_status ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.customer_subscription_status ADD VALUE IF NOT EXISTS 'revoked';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.customer_subscription_status ADD VALUE IF NOT EXISTS 'cancelled_refunded';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
