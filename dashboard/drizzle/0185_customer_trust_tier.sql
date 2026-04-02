-- Trust tier derived from trust_score (stored column + trigger).
-- Ranges: 0–10 Premium, 11–25 Very Good, 26–45 Good, 46–65 Bad, 66–85 Very Bad, 86–100 Fraud.

-- Align with app schema (safe if already present from main DDL)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS sms_permission boolean default false;

DO $$ BEGIN
  CREATE TYPE public.customer_trust_tier AS ENUM (
    'PREMIUM',
    'VERY_GOOD',
    'GOOD',
    'BAD',
    'VERY_BAD',
    'FRAUD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS trust_tier public.customer_trust_tier;

CREATE OR REPLACE FUNCTION public.customers_trust_tier_from_score(score numeric)
RETURNS public.customer_trust_tier
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN score IS NULL THEN 'FRAUD'::public.customer_trust_tier
    WHEN score >= 0::numeric AND score <= 10::numeric THEN 'PREMIUM'::public.customer_trust_tier
    WHEN score <= 25::numeric THEN 'VERY_GOOD'::public.customer_trust_tier
    WHEN score <= 45::numeric THEN 'GOOD'::public.customer_trust_tier
    WHEN score <= 65::numeric THEN 'BAD'::public.customer_trust_tier
    WHEN score <= 85::numeric THEN 'VERY_BAD'::public.customer_trust_tier
    ELSE 'FRAUD'::public.customer_trust_tier
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.customers_set_trust_tier()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.trust_tier := public.customers_trust_tier_from_score(COALESCE(NEW.trust_score, 100::numeric));
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS customers_trust_tier_trigger ON public.customers;

CREATE TRIGGER customers_trust_tier_trigger
  BEFORE INSERT OR UPDATE OF trust_score ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.customers_set_trust_tier();

-- Backfill existing rows
UPDATE public.customers
SET trust_tier = public.customers_trust_tier_from_score(COALESCE(trust_score, 100::numeric));

CREATE INDEX IF NOT EXISTS customers_trust_tier_idx
  ON public.customers (trust_tier)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.customers.trust_tier IS
  'Derived from trust_score: 0–10 Premium … 86–100 Fraud; maintained by trigger.';
