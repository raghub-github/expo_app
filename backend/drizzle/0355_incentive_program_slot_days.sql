-- Incentive program slot day schedule (full week / weekdays / weekends / specific days)
-- Safe to run multiple times.

ALTER TABLE public.incentive_programs
  ADD COLUMN IF NOT EXISTS slot_day_mode text NOT NULL DEFAULT 'full_week';

ALTER TABLE public.incentive_programs
  ADD COLUMN IF NOT EXISTS active_days jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incentive_programs_slot_day_mode_chk'
  ) THEN
    ALTER TABLE public.incentive_programs
      ADD CONSTRAINT incentive_programs_slot_day_mode_chk
      CHECK (slot_day_mode IN ('full_week', 'weekdays', 'weekends', 'specific_days'));
  END IF;
END $$;

COMMENT ON COLUMN public.incentive_programs.slot_day_mode IS
  'Which days the incentive slot applies: full_week | weekdays | weekends | specific_days';

COMMENT ON COLUMN public.incentive_programs.active_days IS
  'When slot_day_mode = specific_days, JSON array of day_of_week ints (0=Sun … 6=Sat).';
