-- =============================================================================
-- 0599_customer_announcement_campaign_rich.sql
-- Rich CUSTOMER_ANNOUNCEMENT campaign fields on the existing campaigns table.
-- Does not create a second announcement system.
-- =============================================================================

ALTER TABLE public.notification_campaigns
  ADD COLUMN IF NOT EXISTS cta_label TEXT,
  ADD COLUMN IF NOT EXISTS countdown_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS announcement_target_type TEXT,
  ADD COLUMN IF NOT EXISTS announcement_target_id TEXT,
  ADD COLUMN IF NOT EXISTS announcement_target_payload JSONB,
  ADD COLUMN IF NOT EXISTS cta_click_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_open_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_campaigns_announcement_window_chk'
  ) THEN
    ALTER TABLE public.notification_campaigns
      ADD CONSTRAINT notification_campaigns_announcement_window_chk
      CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS notification_campaigns_announcement_window_idx
  ON public.notification_campaigns (countdown_enabled, starts_at, ends_at)
  WHERE countdown_enabled = TRUE;

COMMENT ON COLUMN public.notification_campaigns.cta_label IS
  'Admin-controlled CTA button label. NULL/blank = plain notification, no button.';
COMMENT ON COLUMN public.notification_campaigns.countdown_enabled IS
  'When true, customer UI shows remaining time from server now until ends_at.';
