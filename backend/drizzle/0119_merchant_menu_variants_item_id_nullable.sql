-- =============================================================================
-- 0119_merchant_menu_variants_item_id_nullable.sql
-- Relax merchant_menu_item_variants.item_id NOT NULL constraint
-- to match the current backend code, which only uses menu_item_id.
--
-- Some older schemas had:
--   merchant_menu_item_variants.item_id TEXT NOT NULL
-- while newer code inserts using menu_item_id (FK -> merchant_menu_items.id)
-- and never populates item_id. That causes runtime errors like:
--   "null value in column \"item_id\" of relation \"merchant_menu_item_variants\" violates not-null constraint"
--
-- This migration:
--   1) Ensures item_id column exists (TEXT) so we can safely alter it.
--   2) Drops the NOT NULL constraint so inserts no longer fail.
--
-- Safe to run multiple times.
-- =============================================================================

ALTER TABLE merchant_menu_item_variants
  ADD COLUMN IF NOT EXISTS item_id TEXT;

ALTER TABLE merchant_menu_item_variants
  ALTER COLUMN item_id DROP NOT NULL;

