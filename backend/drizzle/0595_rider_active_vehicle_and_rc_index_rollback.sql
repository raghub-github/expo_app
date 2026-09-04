DROP INDEX IF EXISTS riders_active_vehicle_id_idx;
DROP INDEX IF EXISTS rider_vehicles_reg_normalized_idx;
ALTER TABLE rider_vehicles DROP COLUMN IF EXISTS replaced_by_vehicle_id;
ALTER TABLE riders DROP COLUMN IF EXISTS active_vehicle_id;
