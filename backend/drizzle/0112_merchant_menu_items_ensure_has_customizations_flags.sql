-- Ensure merchant_menu_items has has_customizations, has_addons, has_variants.
-- Fixes: column "has_customizations" does not exist (and same for has_addons, has_variants).
-- Source: merchant-menu listItems/getItem SELECT from merchant_menu_items.

ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_customizations BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_addons BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;
