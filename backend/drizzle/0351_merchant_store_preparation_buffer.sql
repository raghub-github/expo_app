-- ============================================================================
-- 0351_merchant_store_preparation_buffer
-- Dedicated column for preparation buffer (extra minutes on top of
-- merchant_stores.avg_preparation_time_minutes on every accept).
-- Backfills from settings_metadata.preparation_buffer_minutes when present.
-- ============================================================================

ALTER TABLE public.merchant_store_settings
  ADD COLUMN IF NOT EXISTS preparation_buffer_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.merchant_store_settings
  DROP CONSTRAINT IF EXISTS merchant_store_settings_prep_buffer_check;

ALTER TABLE public.merchant_store_settings
  ADD CONSTRAINT merchant_store_settings_prep_buffer_check
  CHECK (preparation_buffer_minutes >= 0 AND preparation_buffer_minutes <= 120);

UPDATE public.merchant_store_settings ss
SET preparation_buffer_minutes = GREATEST(
  0,
  LEAST(
    120,
    COALESCE(NULLIF((ss.settings_metadata->>'preparation_buffer_minutes')::int, NULL), 0)
  )
)
WHERE (ss.settings_metadata->>'preparation_buffer_minutes') IS NOT NULL
  AND (ss.settings_metadata->>'preparation_buffer_minutes') ~ '^[0-9]+$';

COMMENT ON COLUMN public.merchant_store_settings.preparation_buffer_minutes IS
  'Extra minutes added to merchant_stores.avg_preparation_time_minutes on manual and auto order accept.';
