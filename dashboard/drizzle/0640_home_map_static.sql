-- Control Dashboard Home: live Mapbox vs static map image.
-- Mode persists in system_config; static image uses app_static_assets + R2.
--
-- I/O-safe / idempotent:
--   • short lock_timeout + statement_timeout (fail fast, no long waits)
--   • constraint rewrite only when 'dashboard' is not already allowed
--   • INSERT … ON CONFLICT for asset slot + system_config seed

SET lock_timeout = '3s';
SET statement_timeout = '15s';

-- Allow dashboard-scoped static asset slots (Home map image).
DO $$
DECLARE
  cname text;
  def text;
BEGIN
  SELECT con.conname, pg_get_constraintdef(con.oid)
  INTO cname, def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'app_static_assets'
    AND con.contype = 'c'
    AND (
      pg_get_constraintdef(con.oid) ILIKE '%customer%rider%merchant%'
      OR con.conname = 'app_static_assets_app_check'
    )
  ORDER BY CASE WHEN con.conname = 'app_static_assets_app_check' THEN 0 ELSE 1 END
  LIMIT 1;

  -- Already allows dashboard — nothing to do.
  IF def IS NOT NULL AND def ILIKE '%dashboard%' THEN
    RETURN;
  END IF;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.app_static_assets DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE public.app_static_assets
    ADD CONSTRAINT app_static_assets_app_check
    CHECK (app IN ('customer', 'rider', 'merchant', 'dashboard'));
END $$;

INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES (
  'dashboard.home.map_static',
  'dashboard',
  'Home Map',
  'Static home map',
  'Control Dashboard Home — shown when Home Map mode is Static Map Image. Fully responsive; aspect ratio preserved.',
  NULL,
  NULL,
  10
)
ON CONFLICT (id) DO UPDATE SET
  app = EXCLUDED.app,
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.system_config (config_key, config_value, value_type, description, category)
VALUES (
  'dashboard.home_map_mode',
  '"live"'::jsonb,
  'string',
  'Control Dashboard Home map mode: live (Mapbox) or static (uploaded image).',
  'dashboard'
)
ON CONFLICT (config_key) DO NOTHING;

RESET lock_timeout;
RESET statement_timeout;
