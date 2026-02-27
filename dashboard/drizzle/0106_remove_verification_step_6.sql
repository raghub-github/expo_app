-- Remove verification step 6 (Preview) and renumber steps 7→6, 8→7, 9→8.
-- Verification steps become 1–8: 1–5 unchanged, 6=Commission plan, 7=Agreement, 8=Sign & submit.

-- 1) Delete step 6 data
DELETE FROM public.store_verification_step_edits WHERE step_number = 6;
DELETE FROM public.store_verification_steps WHERE step_number = 6;

-- 2) Renumber: 9→8, then 8→7, then 7→6 (order matters for unique constraint)
UPDATE public.store_verification_steps SET step_number = 8 WHERE step_number = 9;
UPDATE public.store_verification_steps SET step_number = 7 WHERE step_number = 8;
UPDATE public.store_verification_steps SET step_number = 6 WHERE step_number = 7;

UPDATE public.store_verification_step_edits SET step_number = 8 WHERE step_number = 9;
UPDATE public.store_verification_step_edits SET step_number = 7 WHERE step_number = 8;
UPDATE public.store_verification_step_edits SET step_number = 6 WHERE step_number = 7;

-- 3) Update check constraints to allow only steps 1–8
ALTER TABLE public.store_verification_steps
  DROP CONSTRAINT IF EXISTS store_verification_steps_step_number_check;
ALTER TABLE public.store_verification_steps
  ADD CONSTRAINT store_verification_steps_step_number_check CHECK (step_number >= 1 AND step_number <= 8);

ALTER TABLE public.store_verification_step_edits
  DROP CONSTRAINT IF EXISTS store_verification_step_edits_step_check;
ALTER TABLE public.store_verification_step_edits
  ADD CONSTRAINT store_verification_step_edits_step_check CHECK (step_number >= 1 AND step_number <= 8);
