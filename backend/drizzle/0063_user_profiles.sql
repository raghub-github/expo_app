-- Customer app user profiles (onboarding).
-- user_id format: GM100001, GM100002, ... (application-generated from id).

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL UNIQUE,
  mobile_number TEXT NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT UNIQUE,
  age_group TEXT,
  gender TEXT CHECK (gender IN ('male','female','prefer_not_to_say')),
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  sms_permission BOOLEAN DEFAULT FALSE,
  location_permission BOOLEAN DEFAULT FALSE,
  contacts_permission BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_mobile_idx ON user_profiles (mobile_number);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_idx ON user_profiles (email) WHERE email IS NOT NULL;
