-- Fix: "null value in column menu_id of relation merchant_menu_categories violates not-null constraint"
-- The merchant-menu API uses store_id only (no menu_id). If your table has menu_id NOT NULL, allow NULL
-- so category create/update works without supplying menu_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_menu_categories' AND column_name = 'menu_id'
  ) THEN
    ALTER TABLE merchant_menu_categories ALTER COLUMN menu_id DROP NOT NULL;
  END IF;
END $$;
