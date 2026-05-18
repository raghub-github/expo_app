-- Floating order badge / UI: ON by default for new store settings rows.
ALTER TABLE merchant_store_settings
  ALTER COLUMN show_floating_orders SET DEFAULT true;

COMMENT ON COLUMN merchant_store_settings.show_floating_orders IS
  'When true, merchant sees floating new-order badge on partner portal (default ON).';
