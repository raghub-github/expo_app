-- Admin ELIGIBILITY_OVERRIDE (§31) — an explicit, audited exception that GRANTS a rider a
-- service despite a failing eligibility check. It NEVER falsely marks a document verified;
-- it is a separate, time-boxed, attributable override the engine layers on top of its
-- decision. Deactivate/expire to revoke.
CREATE TABLE IF NOT EXISTS rider_eligibility_overrides (
  id            BIGSERIAL PRIMARY KEY,
  rider_id      INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type  TEXT NOT NULL CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  -- Optional geo scope (NULL = applies anywhere for this rider+service).
  geo_level     geo_pricing_level,
  geo_ref_id    UUID,
  reason        TEXT NOT NULL,
  approved_by   INTEGER,               -- system_users.id of the approving admin
  is_active     BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ,
  effective_to   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rider_elig_override_rider_service_idx
  ON rider_eligibility_overrides (rider_id, service_type)
  WHERE deleted_at IS NULL AND is_active = true;
