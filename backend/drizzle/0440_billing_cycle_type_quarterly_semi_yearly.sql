-- Ensure merchant_plans.billing_cycle enum supports Quarterly + Semi-Yearly (6 months).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_type') THEN
    ALTER TYPE public.billing_cycle_type ADD VALUE IF NOT EXISTS 'QUARTERLY';
    ALTER TYPE public.billing_cycle_type ADD VALUE IF NOT EXISTS 'SEMI_YEARLY';
  END IF;
END $$;
