-- ============================================================================
--  0436_native_device_push_tokens
--
--  Native FCM (Android / web browser) + APNs (iOS) tokens used by:
--    • Mobile apps (Customer / Rider / Merchant) via /v1/push/register
--    • Partnersite + Super Admin dashboard browser push
--    • Super Admin campaign FCM topic + direct-token delivery
--
--  Role topics (Android FCM only): app_customer / app_rider / app_merchant
--  Merchant store topic: merchant_store_<storeId>
--  iOS APNs stored for inventory; Expo remains the iOS delivery path.
--
--  Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.native_device_push_tokens (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  role              TEXT NOT NULL,
  platform          TEXT NOT NULL,
  token_type        TEXT NOT NULL CHECK (token_type IN ('fcm', 'apns')),
  native_token      TEXT NOT NULL,
  store_id          BIGINT,
  subscribed_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  source            TEXT NOT NULL DEFAULT 'app'
                      CHECK (source IN ('app', 'partnersite', 'dashboard', 'browser')),
  device_model      TEXT,
  device_brand      TEXT,
  os_name           TEXT,
  os_version        TEXT,
  app_version       TEXT,
  locale            TEXT,
  timezone          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT native_device_push_tokens_token_unique UNIQUE (native_token)
);

-- Older 0436 installs may lack `source` — add safely.
ALTER TABLE public.native_device_push_tokens
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'native_device_push_tokens_source_check'
  ) THEN
    ALTER TABLE public.native_device_push_tokens
      ADD CONSTRAINT native_device_push_tokens_source_check
      CHECK (source IN ('app', 'partnersite', 'dashboard', 'browser'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS native_device_push_tokens_user_role_idx
  ON public.native_device_push_tokens (user_id, role);

CREATE INDEX IF NOT EXISTS native_device_push_tokens_role_idx
  ON public.native_device_push_tokens (role);

CREATE INDEX IF NOT EXISTS native_device_push_tokens_store_idx
  ON public.native_device_push_tokens (store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS native_device_push_tokens_type_idx
  ON public.native_device_push_tokens (token_type);

CREATE INDEX IF NOT EXISTS native_device_push_tokens_platform_idx
  ON public.native_device_push_tokens (platform);

CREATE INDEX IF NOT EXISTS native_device_push_tokens_source_idx
  ON public.native_device_push_tokens (source);

CREATE INDEX IF NOT EXISTS native_device_push_tokens_last_seen_idx
  ON public.native_device_push_tokens (last_seen_at DESC);

-- Service-role access (Supabase / workers). Ignore if roles absent.
DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_device_push_tokens TO service_role;
  GRANT USAGE, SELECT ON SEQUENCE public.native_device_push_tokens_id_seq TO service_role;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_device_push_tokens TO authenticated;
  GRANT USAGE, SELECT ON SEQUENCE public.native_device_push_tokens_id_seq TO authenticated;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
