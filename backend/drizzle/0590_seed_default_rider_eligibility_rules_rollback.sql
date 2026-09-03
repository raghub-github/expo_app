-- Rollback for 0590 — remove the seeded DEFAULT state-level eligibility rules.
-- Only deletes state rows that STILL MATCH the exact seeded default template, so any
-- admin-edited rule (values changed) is preserved. After rollback the effective policy
-- falls back to the identical code defaults, so behaviour is unchanged.

DELETE FROM rider_service_eligibility_rules r
WHERE r.geo_level = 'state'::geo_pricing_level
  AND r.deleted_at IS NULL
  AND r.priority = 100
  AND r.is_active = true
  AND r.service_enabled = true
  AND r.allowed_fuel_kinds = ARRAY[]::text[]
  AND r.allowed_ownership @> ARRAY['commercial','non_commercial']::text[]
  AND array_length(r.allowed_ownership, 1) = 2
  AND (
    (r.service_type = 'food'
      AND r.dl_requirement = 'required' AND r.rc_requirement = 'optional'
      AND r.commercial_required = false
      AND r.allowed_vehicle_classes = ARRAY['2_wheeler']::text[])
    OR (r.service_type = 'parcel'
      AND r.dl_requirement = 'required' AND r.rc_requirement = 'required'
      AND r.commercial_required = false
      AND r.allowed_vehicle_classes = ARRAY['2_wheeler','3_wheeler','4_wheeler']::text[])
    OR (r.service_type = 'person_ride'
      AND r.dl_requirement = 'required' AND r.rc_requirement = 'required'
      AND r.commercial_required = true
      AND r.allowed_vehicle_classes = ARRAY['2_wheeler','3_wheeler','4_wheeler']::text[])
  );
