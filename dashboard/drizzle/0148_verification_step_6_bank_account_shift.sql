-- Insert "Bank account" as dashboard verification step 6; shift former steps 6–7 to 7–8.
--
-- IMPORTANT: Drop CHECK constraints BEFORE updates. The shift uses temporary negative
-- step_number values (-6, -7); those violate CHECK (step_number >= 1) if the constraint
-- is still attached (or was re-added too early).
--
-- If a previous run failed after re-adding CHECK, run this whole file again — DROP IF EXISTS is safe.

-- 1) Remove CHECK constraints (rejections also has step_number >= 1, so negatives would fail)
ALTER TABLE public.store_verification_steps
  DROP CONSTRAINT IF EXISTS store_verification_steps_step_number_check;
ALTER TABLE public.store_verification_step_edits
  DROP CONSTRAINT IF EXISTS store_verification_step_edits_step_check;
ALTER TABLE public.store_verification_step_rejections
  DROP CONSTRAINT IF EXISTS store_verification_step_rejections_step_check;

-- 2) Move existing 6 -> 7, 7 -> 8 (temporary negatives avoid unique (store_id, step_number) conflicts)
UPDATE public.store_verification_steps SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_steps SET step_number = (-step_number) + 1 WHERE step_number < 0;

UPDATE public.store_verification_step_rejections SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_step_rejections SET step_number = (-step_number) + 1 WHERE step_number < 0;

UPDATE public.store_verification_step_edits SET step_number = -step_number WHERE step_number IN (6, 7);
UPDATE public.store_verification_step_edits SET step_number = (-step_number) + 1 WHERE step_number < 0;

-- 3) Re-attach CHECKs (allow step 8)
ALTER TABLE public.store_verification_steps
  ADD CONSTRAINT store_verification_steps_step_number_check
  CHECK (step_number >= 1 AND step_number <= 8);

ALTER TABLE public.store_verification_step_edits
  ADD CONSTRAINT store_verification_step_edits_step_check
  CHECK (step_number >= 1 AND step_number <= 8);

ALTER TABLE public.store_verification_step_rejections
  ADD CONSTRAINT store_verification_step_rejections_step_check
  CHECK (step_number >= 1 AND step_number <= 8);
