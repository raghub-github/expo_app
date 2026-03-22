-- Repair: if migration failed mid-flight, you may have rows with step_number -6 or -7.
-- Run this once, then you can run 0148 again or finish manually.

ALTER TABLE public.store_verification_steps
  DROP CONSTRAINT IF EXISTS store_verification_steps_step_number_check;
ALTER TABLE public.store_verification_step_edits
  DROP CONSTRAINT IF EXISTS store_verification_step_edits_step_check;
ALTER TABLE public.store_verification_step_rejections
  DROP CONSTRAINT IF EXISTS store_verification_step_rejections_step_check;

UPDATE public.store_verification_steps SET step_number = (-step_number) + 1 WHERE step_number < 0;
UPDATE public.store_verification_step_rejections SET step_number = (-step_number) + 1 WHERE step_number < 0;
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
