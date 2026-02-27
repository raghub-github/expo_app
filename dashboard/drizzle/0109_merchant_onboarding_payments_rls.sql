-- RLS for merchant_onboarding_payments so dashboard verification (step 6) can read payment records.
-- Ensures: RLS enabled, one SELECT policy for dashboard, and GRANT so the backend role can read.

-- 1) Enable Row Level Security (idempotent)
ALTER TABLE public.merchant_onboarding_payments ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policy if present (idempotent)
DROP POLICY IF EXISTS merchant_onboarding_payments_dashboard_select ON public.merchant_onboarding_payments;

-- 3) Allow SELECT: any role with SELECT privilege can read all rows (for dashboard/verification).
CREATE POLICY merchant_onboarding_payments_dashboard_select
  ON public.merchant_onboarding_payments
  FOR SELECT
  USING (true);

-- 4) Grant SELECT so backend/dashboard role can read (fixes "permission denied" or empty result).
--    Grants to public so whichever role your app uses (postgres, authenticated, service_role, etc.) can SELECT.
GRANT SELECT ON public.merchant_onboarding_payments TO public;

-- Optional: if you use a specific app role (e.g. dashboard_backend), grant explicitly:
-- GRANT SELECT ON public.merchant_onboarding_payments TO dashboard_backend;
