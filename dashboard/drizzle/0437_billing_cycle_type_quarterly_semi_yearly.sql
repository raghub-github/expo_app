-- Ensure merchant_plans.billing_cycle enum supports Quarterly + Semi-Yearly (6 months).
-- Some environments were created with only MONTHLY/YEARLY (e.g. partnersite seed).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_type') THEN
    ALTER TYPE public.billing_cycle_type ADD VALUE IF NOT EXISTS 'QUARTERLY';
    ALTER TYPE public.billing_cycle_type ADD VALUE IF NOT EXISTS 'SEMI_YEARLY';
  END IF;
END $$;
