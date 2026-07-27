-- Rollback 0457_rider_onboarding_progress.sql
ALTER TABLE public.riders
  DROP COLUMN IF EXISTS onboarding_progress_pct,
  DROP COLUMN IF EXISTS next_required_step,
  DROP COLUMN IF EXISTS last_completed_step,
  DROP COLUMN IF EXISTS onboarding_progress;
