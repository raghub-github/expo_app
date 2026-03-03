-- Add app profile/onboarding columns to customers for customer app GET/PATCH /me/profile.
-- Run after your customers table exists (e.g. from 0013 or your DDL).

ALTER TABLE customers ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contacts_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sessions_invalid_before TIMESTAMP WITH TIME ZONE;

-- If your customers.full_name is NOT NULL, new signups use full_name = 'Pending' until profile is completed.
