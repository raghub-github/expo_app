import { getSql } from "../db/client.js";

let ensurePromise: Promise<void> | null = null;

/** Ensures incentive_programs has slot_day_mode + active_days (migration 0355). */
export function ensureIncentiveProgramSlotColumns(): Promise<void> {
  if (!ensurePromise) {
    const sql = getSql() as { unsafe: (query: string) => Promise<unknown> };
    ensurePromise = sql
      .unsafe(`
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

        ALTER TABLE public.incentive_programs
          ADD COLUMN IF NOT EXISTS calendar_badges jsonb NOT NULL DEFAULT '[]'::jsonb;

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
      `)
      .then(() => undefined)
      .catch((err) => {
        ensurePromise = null;
        throw err;
      });
  }
  return ensurePromise;
}
