-- Ensure trust_score / fraud_score exist (numeric); sync fraud_score when User Type = FRAUD.
-- When trust_tier is FRAUD (trust_score 86–100 band), fraud_score mirrors trust_score; otherwise fraud_score = 0.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS trust_score numeric(5, 2) default 100.0;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS fraud_score numeric(5, 2) default 0.0;

CREATE OR REPLACE FUNCTION public.customers_set_trust_tier()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  ts numeric;
BEGIN
  ts := COALESCE(NEW.trust_score, 100::numeric);
  NEW.trust_tier := public.customers_trust_tier_from_score(ts);
  IF NEW.trust_tier = 'FRAUD'::public.customer_trust_tier THEN
    NEW.fraud_score := LEAST(100::numeric, GREATEST(0::numeric, ts));
  ELSE
    NEW.fraud_score := 0::numeric;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Backfill fraud_score from trust_tier / trust_score
UPDATE public.customers c
SET fraud_score = CASE
    WHEN c.trust_tier = 'FRAUD'::public.customer_trust_tier THEN
      LEAST(100::numeric, GREATEST(0::numeric, COALESCE(c.trust_score, 100::numeric)))
    ELSE 0::numeric
  END
WHERE c.fraud_score IS DISTINCT FROM CASE
    WHEN c.trust_tier = 'FRAUD'::public.customer_trust_tier THEN
      LEAST(100::numeric, GREATEST(0::numeric, COALESCE(c.trust_score, 100::numeric)))
    ELSE 0::numeric
  END;

COMMENT ON COLUMN public.customers.fraud_score IS
  'When trust_tier is FRAUD, set from trust_score via trigger; otherwise 0.';
