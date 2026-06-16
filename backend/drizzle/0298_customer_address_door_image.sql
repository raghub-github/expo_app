-- Door/building reference image for saved customer delivery addresses.
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS delivery_door_image_url TEXT;

COMMENT ON COLUMN customer_addresses.delivery_door_image_url IS
  'Optional door/building photo URL to help riders find the exact delivery location.';
