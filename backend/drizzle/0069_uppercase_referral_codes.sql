-- =============================================================================
-- Normalize referral_code and referred_by to UPPERCASE in customers table.
-- Run once to fix existing data; new data is already saved in caps by the app.
-- =============================================================================

-- Uppercase referral_code (user's own code) where not null
UPDATE public.customers
SET referral_code = UPPER(TRIM(referral_code)),
    updated_at = COALESCE(updated_at, NOW())
WHERE referral_code IS NOT NULL
  AND referral_code <> UPPER(TRIM(referral_code));

-- Uppercase referred_by (referrer's code entered by user) where not null
UPDATE public.customers
SET referred_by = UPPER(TRIM(referred_by)),
    updated_at = COALESCE(updated_at, NOW())
WHERE referred_by IS NOT NULL
  AND referred_by <> UPPER(TRIM(referred_by));
