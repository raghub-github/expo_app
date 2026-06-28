-- Fix new-customer FRAUD mis-tag: trust_score is a RISK score (0 = best, 100 = worst).
-- Default was 100 → tier FRAUD. New users should start at 5 (Premium band).

CREATE OR REPLACE FUNCTION public.customers_trust_tier_from_score(score numeric)
RETURNS public.customer_trust_tier
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN score IS NULL THEN 'VERY_GOOD'::public.customer_trust_tier
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
DECLARE
  ts numeric;
BEGIN
  ts := COALESCE(NEW.trust_score, 5::numeric);
  NEW.trust_score := ts;
  NEW.trust_tier := public.customers_trust_tier_from_score(ts);
  IF NEW.trust_tier = 'FRAUD'::public.customer_trust_tier THEN
    NEW.fraud_score := LEAST(100::numeric, GREATEST(0::numeric, ts));
  ELSE
    NEW.fraud_score := 0::numeric;
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER TABLE public.customers
  ALTER COLUMN trust_score SET DEFAULT 5.0;

-- Backfill users wrongly tagged FRAUD only from the old default score (no fraud alerts).
UPDATE public.customers c
SET
  trust_score = 5.0,
  updated_at = NOW()
WHERE c.deleted_at IS NULL
  AND c.trust_tier = 'FRAUD'::public.customer_trust_tier
  AND COALESCE(c.trust_score, 100::numeric) >= 86::numeric
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_fraud_alerts fa
    WHERE fa.customer_id = c.id
  )
  AND COALESCE(NULLIF(TRIM(c.status_reason), ''), '') = '';

-- Re-sync tier + fraud_score for backfilled rows (trigger runs on UPDATE OF trust_score).
UPDATE public.customers c
SET trust_score = c.trust_score
WHERE c.deleted_at IS NULL
  AND c.trust_tier = 'FRAUD'::public.customer_trust_tier
  AND c.trust_score = 5.0;

COMMENT ON COLUMN public.customers.trust_score IS
  'Customer risk score 0–100 (lower is better). 0–10 Premium, 11–25 Very Good, 26–45 Good, 46–65 Bad, 66–85 Very Bad, 86–100 Fraud. Default 5 for new signups.';
