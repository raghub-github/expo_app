-- Add owner_full_name to merchant_stores so "Owner Full Name" from step 1 is persisted in DB.
-- Partner Site register-store-progress PUT updates this column; without it only form_data (progress) is updated and DB stays unchanged.
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS owner_full_name TEXT NULL;

COMMENT ON COLUMN public.merchant_stores.owner_full_name IS 'Full name of store owner (from onboarding step 1).';
