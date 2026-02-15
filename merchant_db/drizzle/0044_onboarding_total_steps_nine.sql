-- Onboarding is now 9 steps (was 6). Update merchant_store_registration_progress.

ALTER TABLE public.merchant_store_registration_progress
  ALTER COLUMN total_steps SET DEFAULT 9;

UPDATE public.merchant_store_registration_progress
  SET total_steps = 9
  WHERE total_steps IS NULL OR total_steps < 9;
