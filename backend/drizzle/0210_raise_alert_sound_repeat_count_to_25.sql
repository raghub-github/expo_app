-- ============================================================================
-- 0210_raise_alert_sound_repeat_count_to_25
-- Raise alert_sound_repeat_count max from 10 -> 25 (DB CHECK constraints)
-- This fixes: violates check constraint *_repeat_check when saving 25.
-- ============================================================================

-- platform_food_acceptance_settings_by_store_type
ALTER TABLE IF EXISTS public.platform_food_acceptance_settings_by_store_type
  DROP CONSTRAINT IF EXISTS platform_food_acceptance_settings_by_store_type_repeat_check;

ALTER TABLE IF EXISTS public.platform_food_acceptance_settings_by_store_type
  ADD CONSTRAINT platform_food_acceptance_settings_by_store_type_repeat_check
  CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25);

-- merchant_store_order_acceptance_settings (if present)
ALTER TABLE IF EXISTS public.merchant_store_order_acceptance_settings
  DROP CONSTRAINT IF EXISTS merchant_store_order_acceptance_settings_repeat_count_check;

ALTER TABLE IF EXISTS public.merchant_store_order_acceptance_settings
  ADD CONSTRAINT merchant_store_order_acceptance_settings_repeat_count_check
  CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25);

-- platform_order_acceptance_settings (legacy singleton; may or may not exist)
ALTER TABLE IF EXISTS public.platform_order_acceptance_settings
  DROP CONSTRAINT IF EXISTS platform_order_acceptance_settings_repeat_count_check;

ALTER TABLE IF EXISTS public.platform_order_acceptance_settings
  ADD CONSTRAINT platform_order_acceptance_settings_repeat_count_check
  CHECK (alert_sound_repeat_count >= 0 AND alert_sound_repeat_count <= 25);

