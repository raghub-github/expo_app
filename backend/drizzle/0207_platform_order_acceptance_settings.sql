-- ============================================================================
-- 0207_platform_order_acceptance_settings
-- Global settings (applies to ALL stores):
-- - acceptance window (minutes) per order type
-- - alert sound enabled / sound file url
-- - sound repeat count
--
-- Used by partnersite + merchant app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_order_acceptance_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,

  -- Acceptance windows (minutes)
  acceptance_window_minutes_food INTEGER NOT NULL DEFAULT 5,
  acceptance_window_minutes_parcel INTEGER NOT NULL DEFAULT 2,
  acceptance_window_minutes_person_ride INTEGER NOT NULL DEFAULT 1,

  -- Alert sound config
  alert_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  alert_sound_url TEXT,
  alert_sound_repeat_count INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT platform_order_acceptance_settings_singleton CHECK (id = 1),
  CONSTRAINT platform_order_acceptance_settings_repeat_count_check
    CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25),
  CONSTRAINT platform_order_acceptance_settings_windows_check
    CHECK (
      acceptance_window_minutes_food BETWEEN 1 AND 180
      AND acceptance_window_minutes_parcel BETWEEN 1 AND 180
      AND acceptance_window_minutes_person_ride BETWEEN 1 AND 180
    )
);

-- Ensure singleton row exists
INSERT INTO public.platform_order_acceptance_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS platform_order_acceptance_settings_touch ON public.platform_order_acceptance_settings;
CREATE TRIGGER platform_order_acceptance_settings_touch
BEFORE UPDATE ON public.platform_order_acceptance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

