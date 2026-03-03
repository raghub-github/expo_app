-- Remove verification step 7 (Agreement) and renumber step 8 → 7.
-- Verification steps become 1–7: 1–6 unchanged, 7 = Sign & submit.

-- 1) Delete step 7 data
DELETE FROM public.store_verification_step_edits WHERE step_number = 7;
DELETE FROM public.store_verification_steps WHERE step_number = 7;

-- 2) Renumber step 8 → 7
UPDATE public.store_verification_steps SET step_number = 7 WHERE step_number = 8;
UPDATE public.store_verification_step_edits SET step_number = 7 WHERE step_number = 8;

-- 3) Update check constraints to allow only steps 1–7
ALTER TABLE public.store_verification_steps
  DROP CONSTRAINT IF EXISTS store_verification_steps_step_number_check;
ALTER TABLE public.store_verification_steps
  ADD CONSTRAINT store_verification_steps_step_number_check CHECK (step_number >= 1 AND step_number <= 7);

ALTER TABLE public.store_verification_step_edits
  DROP CONSTRAINT IF EXISTS store_verification_step_edits_step_check;
ALTER TABLE public.store_verification_step_edits
  ADD CONSTRAINT store_verification_step_edits_step_check CHECK (step_number >= 1 AND step_number <= 7);
