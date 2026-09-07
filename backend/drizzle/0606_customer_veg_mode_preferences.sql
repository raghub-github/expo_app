-- Customer Veg Mode: persist All restaurants vs Pure Veg only, plus all-days vs selected weekdays.
-- Filtering is applied automatically from these prefs (no extra client action after Apply).
-- weekdays NULL = every day; otherwise JS getDay() values (0=Sun … 6=Sat).

CREATE TABLE IF NOT EXISTS customer_veg_mode_preferences (
  customer_id BIGINT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  store_scope TEXT NOT NULL DEFAULT 'all_restaurants',
  weekdays SMALLINT[] NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_veg_mode_preferences_scope_chk
    CHECK (store_scope IN ('all_restaurants', 'pure_veg_only')),
  CONSTRAINT customer_veg_mode_preferences_weekdays_chk
    CHECK (
      weekdays IS NULL
      OR (
        cardinality(weekdays) BETWEEN 1 AND 7
        AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
      )
    )
);

CREATE INDEX IF NOT EXISTS customer_veg_mode_preferences_updated_idx
  ON customer_veg_mode_preferences (updated_at DESC);
