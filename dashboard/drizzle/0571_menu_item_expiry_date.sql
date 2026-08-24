-- Grocery menu items: optional product expiry date.
-- Cheap DDL only (ADD COLUMN IF NOT EXISTS). No table rewrites / no backfills.

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

COMMENT ON COLUMN merchant_menu_items.expiry_date IS
  'Optional product expiry (primarily for GROCERY store menu items).';
