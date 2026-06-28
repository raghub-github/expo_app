-- Live schedule columns on merchant_stores: written by the backend
-- store-schedule tick (every 30 s) so EVERY reader — partnersite,
-- merchant app, customer app, dashboard, anything that queries
-- Supabase directly — sees the same answer for the question
-- "is this store open right now and when does it change?".
--
-- Replaces the previous architecture where partnersite + backend
-- each recomputed the answer on their own, producing drift like
-- "Closed" + "Within operating hours" + "Opens in 15h" on the same
-- screen.
--
-- Columns:
--   live_schedule_phase      Strict enum-as-text. One of:
--                              OFF_DAY        — scheduled closed today
--                              BREAK          — between two open slots
--                              PRE_BREAK      — open, break imminent
--                              WITHIN_SLOT    — open per schedule
--                              OUTSIDE_HOURS  — schedule has slots today
--                                                but now isn't in any
--                              NO_HOURS       — hours not configured
--                            NULL = tick has never run for this row.
--
--   next_open_at             ISO timestamptz of the next moment the
--                            store will be OPEN. NULL when it IS open.
--
--   next_close_at            ISO timestamptz of the next moment the
--                            store will be CLOSED. NULL when it is
--                            currently closed.
--
--   manual_override_active   TRUE when the schedule says the store
--                            should be open right now but the
--                            merchant has manually closed it
--                            (toggle off, manual_close_until in future,
--                            block_auto_open). This is the column the
--                            UI needs to render "Closed by merchant —
--                            schedule was open until HH:MM" instead of
--                            the confusing "Within operating hours +
--                            Closed" pair.
--
--   live_status_updated_at   Wall-clock of the last tick write. Lets us
--                            alert when the tick has stalled for any
--                            store.

ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS live_schedule_phase    TEXT,
  ADD COLUMN IF NOT EXISTS next_open_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_close_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_override_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_status_updated_at TIMESTAMPTZ;

-- Validate the enum at the row level. Reject anything we don't know how
-- to render. Easier to add a phase here than to debug a typo'd value
-- five layers up.
ALTER TABLE merchant_stores
  DROP CONSTRAINT IF EXISTS merchant_stores_live_schedule_phase_check;
ALTER TABLE merchant_stores
  ADD  CONSTRAINT merchant_stores_live_schedule_phase_check CHECK (
    live_schedule_phase IS NULL
    OR live_schedule_phase IN (
      'OFF_DAY','BREAK','PRE_BREAK','WITHIN_SLOT','OUTSIDE_HOURS','NO_HOURS'
    )
  );

-- Filter index for "give me every store currently in WITHIN_SLOT etc."
-- — used by the dashboard list views and the customer-app "near you"
-- query that wants only open stores.
CREATE INDEX IF NOT EXISTS merchant_stores_live_schedule_phase_idx
  ON merchant_stores (live_schedule_phase)
  WHERE live_schedule_phase IS NOT NULL;

-- Sorted index for the cron / health monitor: "which store rows
-- haven't been written by the tick recently?". Helps detect a stuck
-- tick on a single replica.
CREATE INDEX IF NOT EXISTS merchant_stores_live_status_updated_at_idx
  ON merchant_stores (live_status_updated_at)
  WHERE live_status_updated_at IS NOT NULL;
