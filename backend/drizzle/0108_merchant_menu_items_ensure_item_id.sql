-- Ensure merchant_menu_items has item_id (required by list items API).
-- Fixes: column "item_id" does not exist (e.g. when table was created without 0010).

ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_id TEXT;

-- Backfill existing rows so NOT NULL can be applied
UPDATE merchant_menu_items
SET item_id = 'ITEM_' || id::text
WHERE item_id IS NULL OR item_id = '';

ALTER TABLE merchant_menu_items ALTER COLUMN item_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_items_item_id_key ON merchant_menu_items(item_id);
