ALTER TABLE public.merchant_store_registration_progress
  ADD COLUMN IF NOT EXISTS step_7_completed boolean DEFAULT false;

