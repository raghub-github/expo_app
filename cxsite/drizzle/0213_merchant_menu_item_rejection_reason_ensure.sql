-- Ensure menu item photo rejection reason is available for merchant app + dashboard.
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN merchant_menu_items.rejection_reason IS
  'Agent-provided reason when item photo/menu entry is rejected (shown to merchant).';
