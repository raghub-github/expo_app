-- Unify all subscription plans (Merchant/Rider/Customer) into one table: merchant_plans.
-- Adds plan_type discriminator + adjusts uniqueness to be per type.

DO $$ BEGIN
  CREATE TYPE public.subscription_plan_type AS ENUM ('MERCHANT', 'RIDER', 'CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.merchant_plans
  ADD COLUMN IF NOT EXISTS plan_type public.subscription_plan_type NULL;

-- Backfill existing rows to MERCHANT
UPDATE public.merchant_plans
SET plan_type = 'MERCHANT'::public.subscription_plan_type
WHERE plan_type IS NULL;

ALTER TABLE public.merchant_plans
  ALTER COLUMN plan_type SET NOT NULL;

-- Replace global-unique constraints with per-type uniqueness.
ALTER TABLE public.merchant_plans
  DROP CONSTRAINT IF EXISTS merchant_plans_plan_code_key,
  DROP CONSTRAINT IF EXISTS merchant_plans_plan_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_plans_type_code_uniq
  ON public.merchant_plans (plan_type, plan_code);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_plans_type_name_uniq
  ON public.merchant_plans (plan_type, plan_name);

CREATE INDEX IF NOT EXISTS merchant_plans_plan_type_idx
  ON public.merchant_plans (plan_type);

