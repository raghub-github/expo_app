-- ============================================================================
-- 0215_platform_food_alert_sound_slots
-- Up to three platform notification sounds per store type (slots 1–3).
-- Merchant chooses active slot via merchant_store_settings.settings_metadata
-- key platform_food_alert_sound_slot (0..2).
-- ============================================================================

ALTER TABLE IF EXISTS public.platform_food_acceptance_settings_by_store_type
  ADD COLUMN IF NOT EXISTS alert_sound_url_2 TEXT,
  ADD COLUMN IF NOT EXISTS alert_sound_url_3 TEXT;
