-- Reference schema for onboarding profile data.
-- Backend implements GET /v1/me/profile and PATCH /v1/me/profile.
-- Run backend migration: backend/drizzle/0063_user_profiles.sql
-- user_id format: GM100001, GM100002, ... (auto-generated from id).

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL UNIQUE,
  mobile_number TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  age_group TEXT,
  gender TEXT CHECK (
    gender IN ('male','female','prefer_not_to_say','others')
  ),
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  sms_permission BOOLEAN DEFAULT FALSE,
  location_permission BOOLEAN DEFAULT FALSE,
  contacts_permission BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
