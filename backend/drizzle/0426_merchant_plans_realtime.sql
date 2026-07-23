-- ─────────────────────────────────────────────────────────────────────────────
-- 0426 · merchant_plans realtime — instant plan-price updates on the partner site
--
-- When the Super Admin changes a plan's price / limits in merchant_plans, the partner
-- site "Available Plans" cards must update INSTANTLY (no manual refresh). The partner
-- site subscribes to Supabase realtime on merchant_plans and re-fetches fresh plans.
--
-- Supabase realtime (postgres_changes) delivers events only to roles that can SELECT the
-- row under RLS. merchant_plans has RLS ON with NO policy → clients receive nothing.
-- Plan config (name/price/limits) is public information already shown on pricing pages,
-- so a read-only SELECT policy is safe. Service-role API routes bypass RLS and are
-- unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow read so realtime events reach subscribed clients (writes stay service-role only).
DROP POLICY IF EXISTS merchant_plans_public_read ON public.merchant_plans;
CREATE POLICY merchant_plans_public_read ON public.merchant_plans
  FOR SELECT
  USING (true);

-- 2. Add the table to the realtime publication (guarded so re-running is a no-op).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'merchant_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_plans;
  END IF;
END $$;
