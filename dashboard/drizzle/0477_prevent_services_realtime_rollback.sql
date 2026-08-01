-- Rollback 0477_prevent_services_realtime.sql
-- Leaves the 0476 tables intact; only removes the realtime signal plumbing.
-- NOTE: the read-only prevent_services_check_point() definition is kept — the
-- 0476 version was non-functional (write inside a STABLE function).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prevent_service_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.prevent_service_signals;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_service_locations_signal ON public.prevent_service_locations;
DROP TRIGGER IF EXISTS trg_prevent_service_services_signal ON public.prevent_service_services;
DROP TRIGGER IF EXISTS trg_prevent_service_rules_signal ON public.prevent_service_rules;

DROP FUNCTION IF EXISTS public.prevent_services_bump_signal();

DROP POLICY IF EXISTS prevent_service_signals_public_read ON public.prevent_service_signals;
REVOKE SELECT ON TABLE public.prevent_service_signals FROM anon, authenticated;

DROP TABLE IF EXISTS public.prevent_service_signals;
