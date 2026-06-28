-- Track consecutive calendar days with subscription penalty (GMitra Max wallet dues).
-- Safe to run multiple times.

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS subscription_penalty_streak_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS subscription_penalty_last_date date NULL;

COMMENT ON COLUMN public.riders.subscription_penalty_streak_days IS
  'Consecutive IST calendar days with unpaid subscription penalty (resets when dues cleared).';

COMMENT ON COLUMN public.riders.subscription_penalty_last_date IS
  'Last IST date counted toward subscription_penalty_streak_days.';
