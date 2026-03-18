ALTER TABLE public.merchant_store_registration_progress
  ADD COLUMN IF NOT EXISTS step_8_completed boolean DEFAULT false;

ALTER TABLE public.merchant_store_registration_progress
  ADD COLUMN IF NOT EXISTS step_9_completed boolean DEFAULT false;

