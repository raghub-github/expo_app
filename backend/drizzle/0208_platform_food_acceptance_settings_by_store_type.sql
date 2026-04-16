-- ============================================================================
-- 0208_platform_food_acceptance_settings_by_store_type
-- Global per-store-type settings for FOOD order acceptance + alert sound.
--
-- Replaces singleton platform_order_acceptance_settings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_food_acceptance_settings_by_store_type (
  store_type TEXT PRIMARY KEY,
  acceptance_window_minutes INTEGER NOT NULL DEFAULT 5,
  alert_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  alert_sound_url TEXT,
  alert_sound_repeat_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT platform_food_acceptance_settings_by_store_type_window_check
    CHECK (acceptance_window_minutes BETWEEN 1 AND 180),
  CONSTRAINT platform_food_acceptance_settings_by_store_type_repeat_check
    CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25)
);

DROP TRIGGER IF EXISTS platform_food_acceptance_settings_by_store_type_touch ON public.platform_food_acceptance_settings_by_store_type;
CREATE TRIGGER platform_food_acceptance_settings_by_store_type_touch
BEFORE UPDATE ON public.platform_food_acceptance_settings_by_store_type
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed rows for all enum store_type values (idempotent)
DO $$
DECLARE
  v TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_type') THEN
    FOR v IN SELECT unnest(enum_range(NULL::store_type))::text LOOP
      INSERT INTO public.platform_food_acceptance_settings_by_store_type (store_type)
      VALUES (v)
      ON CONFLICT (store_type) DO NOTHING;
    END LOOP;
  ELSE
    INSERT INTO public.platform_food_acceptance_settings_by_store_type (store_type)
    VALUES ('GENERAL')
    ON CONFLICT (store_type) DO NOTHING;
  END IF;
END $$;

-- Migrate singleton settings (if existed) into GENERAL row, then drop old table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_order_acceptance_settings'
  ) THEN
    UPDATE public.platform_food_acceptance_settings_by_store_type s
    SET
      acceptance_window_minutes = COALESCE(p.acceptance_window_minutes_food, s.acceptance_window_minutes),
      alert_sound_enabled = COALESCE(p.alert_sound_enabled, s.alert_sound_enabled),
      alert_sound_url = p.alert_sound_url,
      alert_sound_repeat_count = COALESCE(p.alert_sound_repeat_count, s.alert_sound_repeat_count),
      updated_at = now()
    FROM public.platform_order_acceptance_settings p
    WHERE s.store_type = 'GENERAL' AND p.id = 1;

    DROP TABLE public.platform_order_acceptance_settings;
  END IF;
END $$;

