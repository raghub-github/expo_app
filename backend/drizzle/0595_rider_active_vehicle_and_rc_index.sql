-- Multi-vehicle foundation (backend Phase 1).
-- 1) The rider's currently-operating ACTIVE vehicle (single pointer; the one online/dispatch
--    /eligibility resolve against when a rider has >1 vehicle).
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS active_vehicle_id BIGINT
    REFERENCES rider_vehicles(id) ON DELETE SET NULL;

-- 2) Safe RC replacement lineage — points a retired/superseded vehicle at its replacement.
ALTER TABLE rider_vehicles
  ADD COLUMN IF NOT EXISTS replaced_by_vehicle_id BIGINT
    REFERENCES rider_vehicles(id) ON DELETE SET NULL;

-- 3) Fast NORMALISED registration lookup (upper + strip non-alphanumerics) for duplicate-RC
--    detection. Non-unique for now (existing data may hold dupes); the add-vehicle service
--    enforces uniqueness on the normalised value. A UNIQUE index can be added post-dedupe.
CREATE INDEX IF NOT EXISTS rider_vehicles_reg_normalized_idx
  ON rider_vehicles ((upper(regexp_replace(registration_number, '[^A-Za-z0-9]', '', 'g'))))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS riders_active_vehicle_id_idx ON riders (active_vehicle_id);
