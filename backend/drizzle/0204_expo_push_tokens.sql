-- ============================================================================
-- 0204_expo_push_tokens — Unified Expo push tokens per app role (customer / merchant / rider).
-- Token is unique globally; re-registration updates user_id / role / device_type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS expo_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'merchant', 'rider')),
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'web', 'unknown')),
  expo_push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expo_push_tokens_token_unique UNIQUE (expo_push_token)
);

CREATE INDEX IF NOT EXISTS expo_push_tokens_user_id_role_idx
  ON expo_push_tokens (user_id, role);

CREATE INDEX IF NOT EXISTS expo_push_tokens_role_idx
  ON expo_push_tokens (role);

ALTER TABLE expo_push_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Audit log for admin broadcast sends (structured logging also via pino).
-- ============================================================================

CREATE TABLE IF NOT EXISTS expo_push_notification_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_user_ids JSONB,
  tokens_targeted INT NOT NULL DEFAULT 0,
  expo_tickets_ok INT NOT NULL DEFAULT 0,
  expo_tickets_error INT NOT NULL DEFAULT 0,
  detail JSONB
);
