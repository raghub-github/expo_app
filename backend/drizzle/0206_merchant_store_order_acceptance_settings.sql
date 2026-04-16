-- ============================================================================
-- 0206_merchant_store_order_acceptance_settings
-- Per-store settings for:
-- - acceptance window (per order type)
-- - alert sound enabled / sound file url
-- - sound repeat count
--
-- Used by partnersite + merchant app (incoming order modal + auto-cancel).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_store_order_acceptance_settings (
  merchant_store_id BIGINT PRIMARY KEY
    REFERENCES public.merchant_stores(id) ON DELETE CASCADE,

  -- Acceptance windows (seconds)
  acceptance_window_seconds_food INTEGER NOT NULL DEFAULT 300,
  acceptance_window_seconds_parcel INTEGER NOT NULL DEFAULT 90,
  acceptance_window_seconds_person_ride INTEGER NOT NULL DEFAULT 60,

  -- Alert sound config
  alert_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  alert_sound_url TEXT,
  alert_sound_repeat_count INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT merchant_store_order_acceptance_settings_repeat_count_check
    CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25),
  CONSTRAINT merchant_store_order_acceptance_settings_windows_check
    CHECK (
      acceptance_window_seconds_food BETWEEN 10 AND 3600
      AND acceptance_window_seconds_parcel BETWEEN 10 AND 3600
      AND acceptance_window_seconds_person_ride BETWEEN 10 AND 3600
    )
);

CREATE INDEX IF NOT EXISTS merchant_store_order_acceptance_settings_updated_idx
  ON public.merchant_store_order_acceptance_settings (updated_at DESC);

-- Seed defaults for existing stores (idempotent)
INSERT INTO public.merchant_store_order_acceptance_settings (merchant_store_id)
SELECT s.id
FROM public.merchant_stores s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.merchant_store_order_acceptance_settings cfg
  WHERE cfg.merchant_store_id = s.id
);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS merchant_store_order_acceptance_settings_touch ON public.merchant_store_order_acceptance_settings;
CREATE TRIGGER merchant_store_order_acceptance_settings_touch
BEFORE UPDATE ON public.merchant_store_order_acceptance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

