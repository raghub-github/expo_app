-- system_roles had RLS enabled (0018) with no policies; non-owner DB roles cannot INSERT/UPDATE/SELECT.
-- Permissive policy for roles that already have table GRANTs (dashboard DATABASE_URL).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_roles'
      AND policyname = 'system_roles_dashboard_all'
  ) THEN
    CREATE POLICY system_roles_dashboard_all ON public.system_roles
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
