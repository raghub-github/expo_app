-- Ensure merchant_menu_items has item_description (required by list items API).
-- Fixes: column "item_description" does not exist

ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_description TEXT;
