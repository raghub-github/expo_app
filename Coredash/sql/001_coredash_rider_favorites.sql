-- I/O-safe: create-only, no drops/alters of existing data.
-- Per–system-user favorite riders for Coredash fleet UI.

CREATE TABLE IF NOT EXISTS coredash_rider_favorites (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coredash_rider_favorites_user_rider_uq UNIQUE (system_user_id, rider_id)
);

CREATE INDEX IF NOT EXISTS coredash_rider_favorites_user_idx
  ON coredash_rider_favorites (system_user_id);

CREATE INDEX IF NOT EXISTS coredash_rider_favorites_rider_idx
  ON coredash_rider_favorites (rider_id);
