-- Seed DEFAULT rider service-eligibility policies for EVERY state (geo_level='state').
-- One row per (state × service) so admins have an explicit, editable baseline everywhere;
-- the effective policy already falls back to these same code defaults for any unseeded node,
-- so this is purely to surface + make them editable in the dashboard.
--
-- Real-life defaults (see rationale in the eligibility engine / dashboard):
--   FOOD        — 2-wheeler only; DL OPTIONAL, RC optional; commercial NOT required.
--                 (Easiest onboarding — cycles/e-bikes need no licence; admin can set DL
--                  required per state. Food runs on personal 2-wheelers, low scrutiny.)
--   PARCEL      — 2/3/4-wheeler; DL + RC required; commercial NOT required.
--                 (Goods vehicle should be registered; small 2W parcel on private bikes OK.)
--   PERSON_RIDE — 2/3/4-wheeler; DL + RC required; commercial REQUIRED.
--                 (Carrying passengers for hire → transport/commercial vehicle by law;
--                  a state that permits bike-taxis / private cabs can set this to false.)
-- Fuel is unrestricted everywhere (EV is never hard-blocked). Both ownership types are
-- allowed; on Person-Ride the commercial-required gate is what limits it.
--
-- IDEMPOTENT: skips any (state, service) that already has a non-deleted rule, so the one
-- pre-existing rule (and any admin edits) are preserved; safe to re-run.

INSERT INTO rider_service_eligibility_rules (
  geo_level, geo_ref_id, service_type, service_enabled,
  dl_requirement, rc_requirement, commercial_required,
  allowed_vehicle_classes, allowed_fuel_kinds, allowed_ownership,
  priority, is_active
)
SELECT
  'state'::geo_pricing_level,
  s.id,
  v.service_type,
  true,
  v.dl_req,
  v.rc_req,
  v.commercial_required,
  v.vehicle_classes,
  ARRAY[]::text[],                                   -- all fuels
  ARRAY['commercial','non_commercial']::text[],      -- both ownership types
  100,
  true
FROM states s
CROSS JOIN (
  VALUES
    ('food',        'optional', 'optional', false, ARRAY['2_wheeler']::text[]),
    ('parcel',      'required', 'required', false, ARRAY['2_wheeler','3_wheeler','4_wheeler']::text[]),
    ('person_ride', 'required', 'required', true,  ARRAY['2_wheeler','3_wheeler','4_wheeler']::text[])
) AS v(service_type, dl_req, rc_req, commercial_required, vehicle_classes)
WHERE NOT EXISTS (
  SELECT 1 FROM rider_service_eligibility_rules r
  WHERE r.geo_level = 'state'::geo_pricing_level
    AND r.geo_ref_id = s.id
    AND r.service_type = v.service_type
    AND r.deleted_at IS NULL
);
