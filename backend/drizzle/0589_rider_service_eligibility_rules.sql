-- Rider service eligibility policy — geo-scoped, separate from pricing.
-- Nearest-ancestor inheritance via geo_pricing_chain_steps (GLOBAL→STATE→DIVISION→
-- DISTRICT→PINCODE), same mechanism as service_payout_rules. One row configures, per
-- geo node + service, whether the service is enabled and the document/vehicle/commercial
-- gates. Absent → the engine falls back to code defaults (serviceEligibilityDefaults.ts).
-- Document VERIFICATION stays in the KYC tables; this table is only POLICY.

CREATE TABLE IF NOT EXISTS rider_service_eligibility_rules (
  id                       BIGSERIAL PRIMARY KEY,
  geo_level                geo_pricing_level NOT NULL,
  geo_ref_id               UUID NOT NULL,
  service_type             TEXT NOT NULL CHECK (service_type IN ('food','parcel','person_ride')),
  service_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  dl_requirement           TEXT NOT NULL DEFAULT 'required'
                             CHECK (dl_requirement IN ('required','optional','exempt')),
  rc_requirement           TEXT NOT NULL DEFAULT 'required'
                             CHECK (rc_requirement IN ('required','optional','exempt')),
  commercial_required      BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_vehicle_classes  TEXT[] NOT NULL DEFAULT ARRAY['2_wheeler','3_wheeler','4_wheeler']::TEXT[],
  allowed_fuel_kinds       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_ownership        TEXT[] NOT NULL DEFAULT ARRAY['commercial','non_commercial']::TEXT[],
  priority                 INTEGER NOT NULL DEFAULT 100,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from           TIMESTAMPTZ,
  effective_to             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

-- Resolver lookup: active rule at a geo node for a service (highest priority wins).
CREATE INDEX IF NOT EXISTS rider_svc_elig_geo_service_idx
  ON rider_service_eligibility_rules (geo_level, geo_ref_id, service_type, priority DESC, id ASC)
  WHERE deleted_at IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS rider_svc_elig_service_idx
  ON rider_service_eligibility_rules (service_type)
  WHERE deleted_at IS NULL AND is_active;
