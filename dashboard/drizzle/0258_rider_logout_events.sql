-- Rider logout reason capture (app profile logout flow)
-- Migration: 0258_rider_logout_events

CREATE TABLE IF NOT EXISTS rider_logout_events (
  id            TEXT PRIMARY KEY,
  rider_id      INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  device_id     TEXT,
  reason_code   TEXT NOT NULL,
  reason_text   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_logout_events_rider_id_idx
  ON rider_logout_events(rider_id);

CREATE INDEX IF NOT EXISTS rider_logout_events_reason_code_idx
  ON rider_logout_events(reason_code);

CREATE INDEX IF NOT EXISTS rider_logout_events_created_at_idx
  ON rider_logout_events(created_at DESC);

COMMENT ON TABLE rider_logout_events IS 'Logout events with self-reported reason from rider app';
