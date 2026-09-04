-- Rollback 0599_customer_announcement_campaign_rich.sql

ALTER TABLE public.notification_campaigns
  DROP CONSTRAINT IF EXISTS notification_campaigns_announcement_window_chk;

DROP INDEX IF EXISTS public.notification_campaigns_announcement_window_idx;

ALTER TABLE public.notification_campaigns
  DROP COLUMN IF EXISTS cta_label,
  DROP COLUMN IF EXISTS countdown_enabled,
  DROP COLUMN IF EXISTS starts_at,
  DROP COLUMN IF EXISTS ends_at,
  DROP COLUMN IF EXISTS announcement_target_type,
  DROP COLUMN IF EXISTS announcement_target_id,
  DROP COLUMN IF EXISTS announcement_target_payload,
  DROP COLUMN IF EXISTS cta_click_count,
  DROP COLUMN IF EXISTS target_open_count;
