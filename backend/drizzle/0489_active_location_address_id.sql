-- Persist the customer's selected saved delivery address on the session active location.
-- Used so checkout / order placement bind the same addressId the user picked for browsing.
ALTER TABLE customer_active_location
  ADD COLUMN IF NOT EXISTS address_id bigint
    REFERENCES customer_addresses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_active_location_address_id_idx
  ON customer_active_location (address_id)
  WHERE address_id IS NOT NULL;

COMMENT ON COLUMN customer_active_location.address_id IS
  'When set, the customer explicitly selected this saved address for delivery (not live GPS). Checkout and order placement should prefer this id.';
