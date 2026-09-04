-- Idempotent DL-expiry warning ledger (§19). One row per (rider, DL expiry_date, window),
-- so a warning for a given window is sent at most once even if the job runs repeatedly.
CREATE TABLE IF NOT EXISTS rider_dl_expiry_notifications (
  id           BIGSERIAL PRIMARY KEY,
  rider_id     INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  expiry_date  DATE NOT NULL,
  window_days  INTEGER NOT NULL,
  channel      TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rider_id, expiry_date, window_days)
);

CREATE INDEX IF NOT EXISTS rider_dl_expiry_notifications_rider_idx
  ON rider_dl_expiry_notifications (rider_id);
