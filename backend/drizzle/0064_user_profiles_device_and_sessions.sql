-- Store device IP on login and support "logout from all devices".

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sessions_invalid_before TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00';

COMMENT ON COLUMN user_profiles.last_login_ip IS 'Client IP at last OTP verify (login)';
COMMENT ON COLUMN user_profiles.last_login_at IS 'Last login timestamp';
COMMENT ON COLUMN user_profiles.sessions_invalid_before IS 'All JWTs issued before this time are invalid (logout all devices)';
