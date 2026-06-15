-- Order-scoped alternate delivery contact (Zomato-style: alternate becomes primary for rider calls).

ALTER TABLE orders_core
  ADD COLUMN IF NOT EXISTS alternate_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS alternate_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS alternate_contact_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_primary_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_primary_contact_phone TEXT;

COMMENT ON COLUMN orders_core.alternate_contact_name IS 'Receiver alternate contact name set from customer help during live order.';
COMMENT ON COLUMN orders_core.alternate_contact_phone IS 'Receiver alternate contact phone — effective delivery contact once set.';
COMMENT ON COLUMN orders_core.delivery_primary_contact_name IS 'Original delivery contact name before alternate was set.';
COMMENT ON COLUMN orders_core.delivery_primary_contact_phone IS 'Original delivery contact phone before alternate was set.';
