-- ============================================================================
--  0419_expo_push_tokens_device_metadata
--
--  Adds device / app / locale fingerprint columns to expo_push_tokens so the
--  notification pipeline can:
--    • debug delivery per device model + OS version
--    • target sends by app_version (e.g. "only send this to app_version >= 1.0.5")
--    • respect user timezone when scheduling non-urgent pushes
--    • pick the right template language variant by locale
--
--  All columns are nullable — old clients that don't send this metadata
--  continue to register successfully. The dispatcher treats missing fields
--  as unknown (falls back to default templates / immediate send).
--
--  Also adds an updated_at trigger for MAX(updated_at) queries the audit
--  script uses to spot stale registrations.
-- ============================================================================

ALTER TABLE public.expo_push_tokens
  ADD COLUMN IF NOT EXISTS device_model  TEXT,
  ADD COLUMN IF NOT EXISTS device_brand  TEXT,
  ADD COLUMN IF NOT EXISTS os_name       TEXT,
  ADD COLUMN IF NOT EXISTS os_version    TEXT,
  ADD COLUMN IF NOT EXISTS app_version   TEXT,
  ADD COLUMN IF NOT EXISTS locale        TEXT,
  ADD COLUMN IF NOT EXISTS timezone      TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for future "list all devices registered in the last N days" queries
-- used by the analytics dashboard tile "Active devices last 7d".
CREATE INDEX IF NOT EXISTS expo_push_tokens_last_seen_idx
  ON public.expo_push_tokens (last_seen_at DESC);

-- Index for "which app versions are still installed" — useful for planning
-- forced-update prompts and staged feature rollouts.
CREATE INDEX IF NOT EXISTS expo_push_tokens_app_version_idx
  ON public.expo_push_tokens (app_version)
  WHERE app_version IS NOT NULL;
