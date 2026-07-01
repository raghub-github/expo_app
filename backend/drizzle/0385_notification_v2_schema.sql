-- =============================================================================
-- 0385_notification_v2_schema.sql
-- Enterprise notification system schema (Phase 1).
--
-- Adds five tables that together form the orchestration layer for the
-- NotificationService:
--   • notification_templates       — editable per-event templates
--   • notification_campaigns       — one row per "send job" (auto or manual)
--   • notification_dispatch_logs            — one row per delivery attempt (audit + analytics)
--   • notification_user_prefs     — per-user opt-outs per category/template
--   • notification_settings        — global config (rate limits, defaults)
--
-- Reuses existing tables WITHOUT modification:
--   • expo_push_tokens (0204)
--   • merchant_store_push_tokens (0128)
--   • user_device_sessions (0119, 0120)
--   • merchant_store_notifications, order_notifications (legacy inbox)
--
-- All ALTERs are IF NOT EXISTS / DO NOTHING — re-running is safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. notification_templates
-- ---------------------------------------------------------------------------
-- Channel:
--   push      → mobile native push (Expo Push → FCM/APNs)
--   in_app    → inbox/list inside the app (no OS-level pop)
--   browser   → web push (FCM v1 web + VAPID)
--   socket    → real-time admin-side via Socket.io
--   all       → fan out to push + in_app
-- Role:
--   customer | merchant | rider | admin | manager | support | all
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                BIGSERIAL PRIMARY KEY,
  code              TEXT NOT NULL,                          -- ORDER_ACCEPTED, KYC_APPROVED, …
  category          TEXT NOT NULL,                          -- order|payment|kyc|wallet|marketing|system|account|operational|emergency
  role              TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'push',
  title_template    TEXT NOT NULL,
  body_template     TEXT NOT NULL,
  image_url         TEXT,
  icon_url          TEXT,
  deep_link         TEXT,                                   -- /orders/{{orderId}}
  click_action      TEXT,                                   -- OPEN_ORDER, OPEN_WALLET (mobile)
  priority          TEXT NOT NULL DEFAULT 'normal',         -- low|normal|high|critical
  sound             TEXT DEFAULT 'default',
  vibration         BOOLEAN NOT NULL DEFAULT TRUE,
  buttons           JSONB,                                  -- [{label,action,deepLink}]
  variables_schema  JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { customerName:"string", orderId:"string" }
  locale            TEXT NOT NULL DEFAULT 'en',
  version           INT NOT NULL DEFAULT 1,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  retry_count       INT NOT NULL DEFAULT 3,
  expiry_seconds    INT NOT NULL DEFAULT 86400,             -- 24h
  silent            BOOLEAN NOT NULL DEFAULT FALSE,         -- data-only push (no UI)
  collapse_key      TEXT,                                   -- FCM collapse key for de-dup
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT,
  CONSTRAINT notification_templates_code_locale_unique UNIQUE (code, locale)
);

CREATE INDEX IF NOT EXISTS notification_templates_category_role_idx
  ON public.notification_templates (category, role);
CREATE INDEX IF NOT EXISTS notification_templates_enabled_idx
  ON public.notification_templates (enabled) WHERE enabled = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_priority_check') THEN
    ALTER TABLE public.notification_templates
      ADD CONSTRAINT notification_templates_priority_check
      CHECK (priority IN ('low','normal','high','critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_channel_check') THEN
    ALTER TABLE public.notification_templates
      ADD CONSTRAINT notification_templates_channel_check
      CHECK (channel IN ('push','in_app','browser','socket','all'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_role_check') THEN
    ALTER TABLE public.notification_templates
      ADD CONSTRAINT notification_templates_role_check
      CHECK (role IN ('customer','merchant','rider','admin','manager','support','all'));
  END IF;
END$$;

COMMENT ON TABLE public.notification_templates IS
  'Editable per-event templates with {{var}} substitution. Admin can edit title/body/image/deepLink without code changes.';


-- ---------------------------------------------------------------------------
-- 2. notification_campaigns
-- ---------------------------------------------------------------------------
-- target_filter JSONB shape examples:
--   { "user_ids": ["GMC-1","GMC-2"] }
--   { "role": "customer", "city": "Kolkata" }
--   { "role": "rider", "zone": "north", "status": "active" }
--   { "topic": "promo_kolkata" }
--   { "store_id": 77 }
--   { "all_customers": true }
--   { "subscription_status": "active" }
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  template_code     TEXT,                                   -- FK by code (templates can have multiple locale rows)
  override_title    TEXT,                                   -- if set, overrides template title for this campaign
  override_body     TEXT,
  override_image    TEXT,
  override_deep_link TEXT,
  target_filter     JSONB NOT NULL,
  variables         JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at      TIMESTAMPTZ,                            -- NULL = send immediately
  status            TEXT NOT NULL DEFAULT 'draft',          -- draft|scheduled|running|completed|cancelled|failed
  sent_count        INT NOT NULL DEFAULT 0,
  delivered_count   INT NOT NULL DEFAULT 0,
  clicked_count     INT NOT NULL DEFAULT 0,
  failed_count      INT NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_campaigns_status_scheduled_idx
  ON public.notification_campaigns (status, scheduled_at)
  WHERE status IN ('scheduled','running');
CREATE INDEX IF NOT EXISTS notification_campaigns_created_by_idx
  ON public.notification_campaigns (created_by, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_campaigns_status_check') THEN
    ALTER TABLE public.notification_campaigns
      ADD CONSTRAINT notification_campaigns_status_check
      CHECK (status IN ('draft','scheduled','running','completed','cancelled','failed'));
  END IF;
END$$;

COMMENT ON TABLE public.notification_campaigns IS
  'One row per send job (manual broadcast or automatic event). Drafts / scheduled / running / completed lifecycle.';


-- ---------------------------------------------------------------------------
-- 3. notification_dispatch_logs
-- ---------------------------------------------------------------------------
-- One row per delivery ATTEMPT (not per click). Status transitions:
--   queued → sent → delivered → clicked
--                 → failed (terminal)
--                 → expired (terminal)
CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id                BIGSERIAL PRIMARY KEY,
  notification_id   UUID NOT NULL DEFAULT gen_random_uuid(), -- exposed to clients for click tracking
  campaign_id       BIGINT REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  template_code     TEXT,
  recipient_user_id TEXT NOT NULL,
  recipient_role    TEXT NOT NULL,
  device_token      TEXT,                                   -- expo[…] or FCM token
  device_id         TEXT,
  platform          TEXT,                                   -- android|ios|web
  channel           TEXT NOT NULL DEFAULT 'push',
  title             TEXT,
  body              TEXT,
  image_url         TEXT,
  deep_link         TEXT,
  priority          TEXT,
  status            TEXT NOT NULL DEFAULT 'queued',
  error_code        TEXT,                                   -- DeviceNotRegistered, MismatchSenderId, …
  error_message     TEXT,
  queued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  clicked_at        TIMESTAMPTZ,
  expired_at        TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  retry_attempts    INT NOT NULL DEFAULT 0,
  metadata          JSONB                                   -- order_id, store_id, custom data
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_dispatch_logs_notification_id_uniq
  ON public.notification_dispatch_logs (notification_id);
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_recipient_recent_idx
  ON public.notification_dispatch_logs (recipient_user_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_campaign_status_idx
  ON public.notification_dispatch_logs (campaign_id, status) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_status_recent_idx
  ON public.notification_dispatch_logs (status, queued_at DESC) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_template_status_idx
  ON public.notification_dispatch_logs (template_code, status, queued_at DESC) WHERE template_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_dispatch_logs_status_check') THEN
    ALTER TABLE public.notification_dispatch_logs
      ADD CONSTRAINT notification_dispatch_logs_status_check
      CHECK (status IN ('queued','sent','delivered','clicked','failed','expired'));
  END IF;
END$$;

COMMENT ON TABLE public.notification_dispatch_logs IS
  'One row per delivery attempt. Source of truth for history + analytics. Audit-first: row is written BEFORE the carrier call.';


-- ---------------------------------------------------------------------------
-- 4. notification_user_prefs
-- ---------------------------------------------------------------------------
-- type = template_code (e.g. ORDER_ACCEPTED) OR category (e.g. marketing).
-- NotificationService checks both: if a row exists for the exact code, that
-- wins; else fall back to the category-level row; else default (enabled).
CREATE TABLE IF NOT EXISTS public.notification_user_prefs (
  user_id   TEXT NOT NULL,
  type      TEXT NOT NULL,                                  -- code OR category
  push      BOOLEAN NOT NULL DEFAULT TRUE,
  in_app    BOOLEAN NOT NULL DEFAULT TRUE,
  browser   BOOLEAN NOT NULL DEFAULT TRUE,
  email     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

COMMENT ON TABLE public.notification_user_prefs IS
  'Per-user opt-outs. Lookups: 1) exact template_code 2) category fallback 3) default-enabled.';


-- ---------------------------------------------------------------------------
-- 5. notification_settings
-- ---------------------------------------------------------------------------
-- Key-value store for global notification config.
--   rate_limit_per_user_per_hour    INT
--   quiet_hours_start_local         "22:00"
--   quiet_hours_end_local           "07:00"
--   default_sound                   "default" | "kaching"
--   default_priority                "normal"
--   topic_subscription_max_per_user 50
--   marketing_send_window_local     {"start":"10:00","end":"21:00"}
CREATE TABLE IF NOT EXISTS public.notification_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Seed defaults (idempotent).
INSERT INTO public.notification_settings (key, value, description) VALUES
  ('rate_limit_per_user_per_hour',  '20'::jsonb,                     'Max notifications a single user can receive per rolling hour'),
  ('quiet_hours',                   '{"start":"22:00","end":"07:00","timezone":"Asia/Kolkata","applies_to":["marketing","announcement"]}'::jsonb, 'Suppress marketing/announcement during night hours'),
  ('default_sound',                 '"default"'::jsonb,              'Default push sound'),
  ('default_priority',              '"normal"'::jsonb,               'Default priority'),
  ('topic_subscription_max_per_user', '50'::jsonb,                   'Max topics a single device can subscribe to'),
  ('marketing_send_window_local',   '{"start":"10:00","end":"21:00","timezone":"Asia/Kolkata"}'::jsonb, 'Marketing campaigns only deliver in this window'),
  ('scheduled_poll_interval_sec',   '30'::jsonb,                     'How often the scheduler polls for due campaigns')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.notification_settings IS
  'Global notification config. Read by NotificationService at every send; cached for 60s.';


-- ---------------------------------------------------------------------------
-- 6. Trigger to keep updated_at fresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notif_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON public.notification_templates;
CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_campaigns_updated_at ON public.notification_campaigns;
CREATE TRIGGER trg_notification_campaigns_updated_at
  BEFORE UPDATE ON public.notification_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_user_prefs_updated_at ON public.notification_user_prefs;
CREATE TRIGGER trg_notification_user_prefs_updated_at
  BEFORE UPDATE ON public.notification_user_prefs
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_set_updated_at();
