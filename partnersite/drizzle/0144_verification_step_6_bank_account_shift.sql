-- Same as dashboard/drizzle/0148_verification_step_6_bank_account_shift.sql (shared DB).
-- Drop CHECKs first; negative intermediate step_number values must not run under CHECK (>= 1).

ALTER TABLE public.store_verification_steps
  DROP CONSTRAINT IF EXISTS store_verification_steps_step_number_check;
ALTER TABLE public.store_verification_step_edits
  DROP CONSTRAINT IF EXISTS store_verification_step_edits_step_check;
ALTER TABLE public.store_verification_step_rejections
  DROP CONSTRAINT IF EXISTS store_verification_step_rejections_step_check;

UPDATE public.store_verification_steps SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_steps SET step_number = (-step_number) + 1 WHERE step_number < 0;

UPDATE public.store_verification_step_rejections SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_step_rejections SET step_number = (-step_number) + 1 WHERE step_number < 0;

UPDATE public.store_verification_step_edits SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_step_edits SET step_number = (-step_number) + 1 WHERE step_number < 0;

ALTER TABLE public.store_verification_steps
  ADD CONSTRAINT store_verification_steps_step_number_check
  CHECK (step_number >= 1 AND step_number <= 8);

ALTER TABLE public.store_verification_step_edits
  ADD CONSTRAINT store_verification_step_edits_step_check
  CHECK (step_number >= 1 AND step_number <= 8);

ALTER TABLE public.store_verification_step_rejections
  ADD CONSTRAINT store_verification_step_rejections_step_check
  CHECK (step_number >= 1 AND step_number <= 8);
