-- Drop first_name, last_name; add address and email verification columns; backfill primary_mobile_normalized
-- Run after 0066.

-- Drop first/last name columns
ALTER TABLE public.customers DROP COLUMN IF EXISTS first_name;
ALTER TABLE public.customers DROP COLUMN IF EXISTS last_name;

-- Address / location columns (user address saved from app)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

-- When email was verified (for profile "Verify email" flow)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- Ensure app permission columns exist (idempotent)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sms_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS location_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contacts_permission BOOLEAN DEFAULT FALSE;

-- Backfill primary_mobile_normalized from primary_mobile (digits only)
UPDATE public.customers
SET primary_mobile_normalized = regexp_replace(primary_mobile, '\D', '', 'g')
WHERE primary_mobile_normalized IS NULL AND primary_mobile IS NOT NULL;
