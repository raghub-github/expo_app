-- Persist partner staff-action OTPs (invite / remove / logout) so verify works
-- across Next.js HMR reloads and multiple Node workers.

CREATE TABLE IF NOT EXISTS public.merchant_action_otps (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  email TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_action_otps_expires_at_idx
  ON public.merchant_action_otps (expires_at);

CREATE INDEX IF NOT EXISTS merchant_action_otps_user_id_idx
  ON public.merchant_action_otps (user_id);
