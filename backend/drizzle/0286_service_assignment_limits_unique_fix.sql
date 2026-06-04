-- Repair: UNIQUE(service_type) required for Super Admin upsert (ON CONFLICT (service_type)).
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_service_assignment_limits'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'platform_service_assignment_limits'
      AND c.conname = 'platform_service_assignment_limits_service_unique'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'platform_service_assignment_limits'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%service_type%'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.platform_service_assignment_limits
    ADD CONSTRAINT platform_service_assignment_limits_service_unique UNIQUE (service_type);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
