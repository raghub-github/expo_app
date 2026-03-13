-- =============================================================================
-- Fix merchant_menu_item_images.item_id NOT NULL issue
-- and enforce unique item names per store.
--
-- 1) Old schemas sometimes had merchant_menu_item_images.item_id TEXT NOT NULL.
--    Current code only uses menu_item_id (FK -> merchant_menu_items.id).
--    This migration:
--      - Adds item_id column if missing
--      - Drops NOT NULL so inserts no longer fail with "null value in column item_id"
--
-- 2) Enforce unique item names per store (case-insensitive, trimmed) so that
--    duplicate item names are not allowed going forward.
--    Existing duplicates are auto-renamed with a " (duplicate N)" suffix.
--
-- Safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Relax merchant_menu_item_images.item_id NOT NULL
-- ---------------------------------------------------------------------------

ALTER TABLE merchant_menu_item_images
  ADD COLUMN IF NOT EXISTS item_id TEXT;

ALTER TABLE merchant_menu_item_images
  ALTER COLUMN item_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Ensure unique item names per store
-- ---------------------------------------------------------------------------

-- First, auto-rename existing duplicates so we can add a unique index.
WITH duplicates AS (
  SELECT
    id,
    store_id,
    item_name,
    ROW_NUMBER() OVER (
      PARTITION BY store_id, LOWER(TRIM(item_name))
      ORDER BY id
    ) AS rn
  FROM merchant_menu_items
  WHERE (is_deleted IS NULL OR is_deleted = FALSE)
    AND item_name IS NOT NULL
),
dups_to_rename AS (
  SELECT id, store_id, item_name, rn
  FROM duplicates
  WHERE rn > 1
)
UPDATE merchant_menu_items m
SET item_name = m.item_name || ' (duplicate ' || (d.rn - 1) || ')'
FROM dups_to_rename d
WHERE m.id = d.id;

-- Now create a case-insensitive, trimmed unique index per store.
-- This prevents inserting two active items with the same name in the same store.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_items_store_item_name_ci_uniq
ON merchant_menu_items (
  store_id,
  LOWER(TRIM(item_name))
)
WHERE (is_deleted IS NULL OR is_deleted = FALSE)
  AND item_name IS NOT NULL;

