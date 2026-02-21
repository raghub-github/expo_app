-- =============================================================================
-- FULL CUSTOMERS TABLE FOR CUSTOMER APP + SUPABASE
-- Run this on Supabase SQL Editor (or any Postgres). Idempotent where possible.
-- Includes: enums, table, indexes, app columns, address/lat/lon, no first/last name.
-- =============================================================================

-- 1) Enums (create if not exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_gender') THEN
    CREATE TYPE customer_gender AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_status') THEN
    CREATE TYPE customer_status AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DEACTIVATED', 'PENDING_VERIFICATION');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

-- 2) Table (create if not exist) – without first_name/last_name; with lat/lon and app columns
CREATE TABLE IF NOT EXISTS public.customers (
  id BIGSERIAL NOT NULL,
  customer_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NULL,
  primary_mobile TEXT NOT NULL,
  primary_mobile_normalized TEXT NULL,
  primary_mobile_country_code TEXT NULL DEFAULT '+91',
  mobile_verified BOOLEAN NULL DEFAULT TRUE,
  alternate_mobile TEXT NULL,
  whatsapp_number TEXT NULL,
  gender customer_gender NULL,
  date_of_birth DATE NULL,
  profile_image_url TEXT NULL,
  bio TEXT NULL,
  preferred_language TEXT NULL DEFAULT 'en',
  referral_code TEXT NULL,
  referred_by TEXT NULL,
  referrer_customer_id BIGINT NULL,
  account_status customer_status NOT NULL DEFAULT 'ACTIVE',
  status_reason TEXT NULL,
  risk_flag risk_level NULL DEFAULT 'LOW',
  trust_score NUMERIC(5, 2) NULL DEFAULT 100.0,
  fraud_score NUMERIC(5, 2) NULL DEFAULT 0.0,
  wallet_balance NUMERIC(12, 2) NULL DEFAULT 0.0,
  wallet_locked_amount NUMERIC(12, 2) NULL DEFAULT 0.0,
  is_identity_verified BOOLEAN NULL DEFAULT FALSE,
  is_email_verified BOOLEAN NULL DEFAULT FALSE,
  is_mobile_verified BOOLEAN NULL DEFAULT TRUE,
  last_login_at TIMESTAMP WITH TIME ZONE NULL,
  last_order_at TIMESTAMP WITH TIME ZONE NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE NULL,
  deleted_at TIMESTAMP WITH TIME ZONE NULL,
  deleted_by INTEGER NULL,
  deletion_reason TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_via TEXT NULL DEFAULT 'app',
  updated_by TEXT NULL,
  age_group TEXT NULL,
  profile_completed BOOLEAN NULL DEFAULT FALSE,
  sms_permission BOOLEAN NULL DEFAULT FALSE,
  location_permission BOOLEAN NULL DEFAULT FALSE,
  contacts_permission BOOLEAN NULL DEFAULT FALSE,
  sessions_invalid_before TIMESTAMP WITH TIME ZONE NULL,
  address_line1 TEXT NULL,
  address_line2 TEXT NULL,
  city TEXT NULL,
  state TEXT NULL,
  pincode TEXT NULL,
  country TEXT NULL,
  latitude NUMERIC(10, 7) NULL,
  longitude NUMERIC(10, 7) NULL,
  email_verified_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_email_key UNIQUE (email),
  CONSTRAINT customers_customer_id_key UNIQUE (customer_id),
  CONSTRAINT customers_primary_mobile_key UNIQUE (primary_mobile),
  CONSTRAINT customers_referral_code_key UNIQUE (referral_code)
);

-- Add self-referencing FK only if table was just created or column exists (skip if causes error)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'customers' AND constraint_name = 'customers_referrer_customer_id_fkey'
  ) THEN
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_referrer_customer_id_fkey
    FOREIGN KEY (referrer_customer_id) REFERENCES public.customers (id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Optional checks (add only if you want them; can fail if data exists)
-- ALTER TABLE public.customers ADD CONSTRAINT customers_trust_score_range CHECK (trust_score >= 0 AND trust_score <= 100);
-- ALTER TABLE public.customers ADD CONSTRAINT customers_wallet_balance_positive CHECK (wallet_balance >= 0);
-- ALTER TABLE public.customers ADD CONSTRAINT customers_fraud_score_range CHECK (fraud_score >= 0 AND fraud_score <= 100);

-- 3) Drop first_name / last_name if they exist (from older migrations)
ALTER TABLE public.customers DROP COLUMN IF EXISTS first_name;
ALTER TABLE public.customers DROP COLUMN IF EXISTS last_name;

-- 4) Add app + address columns if table already existed without them
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sms_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS location_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contacts_permission BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sessions_invalid_before TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS customers_customer_id_idx ON public.customers (customer_id);
CREATE INDEX IF NOT EXISTS customers_primary_mobile_idx ON public.customers (primary_mobile);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_referral_code_idx ON public.customers (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_account_status_idx ON public.customers (account_status);
CREATE INDEX IF NOT EXISTS customers_risk_flag_idx ON public.customers (risk_flag);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers (created_at);

-- 6) Backfill primary_mobile_normalized (digits only from primary_mobile)
UPDATE public.customers
SET primary_mobile_normalized = regexp_replace(primary_mobile, '\D', '', 'g')
WHERE primary_mobile_normalized IS NULL AND primary_mobile IS NOT NULL;
