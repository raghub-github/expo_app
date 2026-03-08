-- Ensure merchant_menu_items has item_image_url (required by list items API).
-- Fixes: column "item_image_url" does not exist

ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_image_url TEXT;
