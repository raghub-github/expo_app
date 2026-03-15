-- Merchant sessions: device-scoped sessions so same device can only have one active merchant session.
-- On new login (same or different merchant), previous session for that device is deactivated.
-- Identity is merchant_parents.id; email/phone are attributes only.

CREATE TABLE IF NOT EXISTS public.merchant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id BIGINT NOT NULL REFERENCES public.merchant_parents(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  refresh_token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_id_idx
  ON public.merchant_sessions(merchant_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS merchant_sessions_device_id_idx
  ON public.merchant_sessions(device_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS merchant_sessions_expires_at_idx
  ON public.merchant_sessions(expires_at) WHERE is_active = true;

COMMENT ON TABLE public.merchant_sessions IS 'One active session per device. New login on same device deactivates previous session.';
COMMENT ON COLUMN public.merchant_sessions.merchant_id IS 'merchant_parents.id — primary identity.';
COMMENT ON COLUMN public.merchant_sessions.device_id IS 'Client device identifier; same device gets only one active session.';
COMMENT ON COLUMN public.merchant_sessions.refresh_token_hash IS 'Optional hash of refresh token for server-side validation.';
COMMENT ON COLUMN public.merchant_sessions.expires_at IS 'Session expiry; aligned with Supabase refresh token or custom TTL.';
