DROP INDEX IF EXISTS customer_active_location_address_id_idx;
ALTER TABLE customer_active_location DROP COLUMN IF EXISTS address_id;
