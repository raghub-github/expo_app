-- Rollback 0640_home_map_static (I/O-safe / idempotent)

SET lock_timeout = '3s';
SET statement_timeout = '15s';

DELETE FROM public.system_config WHERE config_key = 'dashboard.home_map_mode';
DELETE FROM public.app_static_assets WHERE id = 'dashboard.home.map_static';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'app_static_assets'
    AND con.contype = 'c'
    AND (
      pg_get_constraintdef(con.oid) ILIKE '%dashboard%'
      OR con.conname = 'app_static_assets_app_check'
    )
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.app_static_assets DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'app_static_assets'
      AND con.conname = 'app_static_assets_app_check'
  ) THEN
    ALTER TABLE public.app_static_assets
      ADD CONSTRAINT app_static_assets_app_check
      CHECK (app IN ('customer', 'rider', 'merchant'));
  END IF;
END $$;

RESET lock_timeout;
RESET statement_timeout;
