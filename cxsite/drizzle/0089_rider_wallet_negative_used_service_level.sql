-- Rider Blacklist/Whitelist Redesign: service-level negative tracking
-- Blocking uses negative_used_* (only counted after wallet goes negative); threshold -50 per service.
-- See backend/docs/schema/BLACKLIST_WHITELIST_REDESIGN.md

-- Add service-level negative contribution columns (amount of negative balance attributed to each service)
ALTER TABLE rider_wallet
  ADD COLUMN IF NOT EXISTS negative_used_food numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_used_parcel numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_used_person_ride numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN rider_wallet.negative_used_food IS 'Amount of negative balance attributed to Food (for -50 threshold). Reset to 0 when total_balance >= 0.';
COMMENT ON COLUMN rider_wallet.negative_used_parcel IS 'Amount of negative balance attributed to Parcel. Reset to 0 when total_balance >= 0.';
COMMENT ON COLUMN rider_wallet.negative_used_person_ride IS 'Amount of negative balance attributed to Person Ride. Reset to 0 when total_balance >= 0.';

-- Index for queries that filter by riders with negative balance (optional)
CREATE INDEX IF NOT EXISTS rider_wallet_negative_balance_idx ON rider_wallet (rider_id)
  WHERE total_balance < 0;

-- Optional backfill: for existing riders with negative balance, distribute negative proportionally by penalties
-- so that blocking state is reasonable until next penalty/revert. (Exact backfill would replay ledger.)
UPDATE rider_wallet w
SET
  negative_used_food = CASE
    WHEN (w.total_balance >= 0) THEN 0
    WHEN (COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0)) <= 0 THEN 0
    ELSE LEAST(
      COALESCE(w.penalties_food, 0)::numeric,
      (-w.total_balance::numeric) * (COALESCE(w.penalties_food, 0) / NULLIF(COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0), 0))
    )
  END,
  negative_used_parcel = CASE
    WHEN (w.total_balance >= 0) THEN 0
    WHEN (COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0)) <= 0 THEN 0
    ELSE LEAST(
      COALESCE(w.penalties_parcel, 0)::numeric,
      (-w.total_balance::numeric) * (COALESCE(w.penalties_parcel, 0) / NULLIF(COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0), 0))
    )
  END,
  negative_used_person_ride = CASE
    WHEN (w.total_balance >= 0) THEN 0
    WHEN (COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0)) <= 0 THEN 0
    ELSE LEAST(
      COALESCE(w.penalties_person_ride, 0)::numeric,
      (-w.total_balance::numeric) * (COALESCE(w.penalties_person_ride, 0) / NULLIF(COALESCE(w.penalties_food, 0) + COALESCE(w.penalties_parcel, 0) + COALESCE(w.penalties_person_ride, 0), 0))
    )
  END
WHERE w.total_balance < 0;
