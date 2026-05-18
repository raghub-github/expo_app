-- Commission Engine v2 — Phase 4 of 4
--
-- Ensures the singleton in store_onboarding_commission_config carries the
-- platform-wide default commission used by the resolver as the last fallback.
-- Idempotent: only writes when the existing value is 0 / NULL so production
-- values entered through the super-admin dashboard are never clobbered.
--
-- Note: store_onboarding_commission_config lives in dashboard/drizzle/0189.
-- We guard with a table-exists check so this migration is safe to run before
-- the dashboard table is in place (it just no-ops).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'store_onboarding_commission_config'
  ) THEN
    UPDATE public.store_onboarding_commission_config
    SET base_service_fee_percent = 15.00,
        updated_at = NOW()
    WHERE id = 1
      AND (base_service_fee_percent IS NULL OR base_service_fee_percent = 0);
  END IF;
END $$;

-- Record the seed in the audit log so the rate history shows a starting point.
INSERT INTO public.commission_audit_log (action, old_value, new_value, actor_role, reason)
SELECT
  'DEFAULT_CHANGED',
  jsonb_build_object('base_service_fee_percent', 0),
  jsonb_build_object('base_service_fee_percent', 15.00),
  'system',
  'Initial seed of platform default commission for v2 engine'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_audit_log WHERE action = 'DEFAULT_CHANGED'
);
