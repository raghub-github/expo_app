-- Calendar date-strip badges for rider incentive programs (Super Admin configurable).
-- Each entry: { "date": "YYYY-MM-DD", "label": "Special" }
-- Safe to run multiple times.

ALTER TABLE public.incentive_programs
  ADD COLUMN IF NOT EXISTS calendar_badges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.incentive_programs.calendar_badges IS
  'Rider Offers date-strip badges: [{ "date": "YYYY-MM-DD", "label": "Special" }]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incentive_programs_calendar_badges_chk'
  ) THEN
    ALTER TABLE public.incentive_programs
      ADD CONSTRAINT incentive_programs_calendar_badges_chk
      CHECK (jsonb_typeof(calendar_badges) = 'array');
  END IF;
END $$;
