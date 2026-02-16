-- ============================================================================
-- RIDER ACTIVITY LOGS – Tables for tracking rider login time, service, orders, earnings
-- ============================================================================
-- Run this SQL in your PostgreSQL/Supabase SQL editor to create/update schema.
-- Migration: 0058_rider_activity_logs
-- ============================================================================

-- ============================================================================
-- 1. rider_activity_sessions – One row per login session (per service)
-- Used for: login time per day/week/month, which service rider was logged in for
-- Can be backfilled from duty_logs (ON -> OFF) or written in real time by app
-- ============================================================================
CREATE TABLE IF NOT EXISTS rider_activity_sessions (
  id                BIGSERIAL PRIMARY KEY,
  rider_id          INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type      TEXT NOT NULL CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_activity_sessions_rider_id_idx
  ON rider_activity_sessions(rider_id);
CREATE INDEX IF NOT EXISTS rider_activity_sessions_started_at_idx
  ON rider_activity_sessions(started_at);
CREATE INDEX IF NOT EXISTS rider_activity_sessions_rider_started_idx
  ON rider_activity_sessions(rider_id, started_at);
CREATE INDEX IF NOT EXISTS rider_activity_sessions_service_type_idx
  ON rider_activity_sessions(service_type);

COMMENT ON TABLE rider_activity_sessions IS 'Rider login sessions per service for activity logs and login time tracking';

-- ============================================================================
-- 2. rider_activity_daily – One row per rider per day per service (aggregates)
-- Used for: fast dashboard filters (date, service), order counts, earnings
-- Populate via nightly job from duty_logs + orders + wallet_ledger or on-demand
-- ============================================================================
CREATE TABLE IF NOT EXISTS rider_activity_daily (
  rider_id               INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  activity_date          DATE NOT NULL,
  service_type           TEXT NOT NULL CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  total_login_seconds    INTEGER NOT NULL DEFAULT 0,
  first_login_at         TIMESTAMPTZ,
  last_logout_at         TIMESTAMPTZ,
  orders_completed       INTEGER NOT NULL DEFAULT 0,
  orders_cancelled       INTEGER NOT NULL DEFAULT 0,
  earnings_orders        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_offers        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_incentives    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rider_id, activity_date, service_type)
);

CREATE INDEX IF NOT EXISTS rider_activity_daily_rider_id_idx
  ON rider_activity_daily(rider_id);
CREATE INDEX IF NOT EXISTS rider_activity_daily_activity_date_idx
  ON rider_activity_daily(activity_date);
CREATE INDEX IF NOT EXISTS rider_activity_daily_service_type_idx
  ON rider_activity_daily(service_type);
CREATE INDEX IF NOT EXISTS rider_activity_daily_rider_date_idx
  ON rider_activity_daily(rider_id, activity_date);

COMMENT ON TABLE rider_activity_daily IS 'Daily per-service activity aggregates for rider dashboard (login time, orders, earnings)';

-- ============================================================================
-- Optional: Trigger to keep updated_at in sync
-- ============================================================================
CREATE OR REPLACE FUNCTION rider_activity_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_activity_daily_updated_at_trigger ON rider_activity_daily;
CREATE TRIGGER rider_activity_daily_updated_at_trigger
  BEFORE UPDATE ON rider_activity_daily
  FOR EACH ROW EXECUTE PROCEDURE rider_activity_daily_updated_at();
