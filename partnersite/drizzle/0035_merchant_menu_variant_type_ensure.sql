-- Ensure merchant_menu_item_variants has variant_type (title for variant group e.g. "Size").
-- Idempotent: only adds column if missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_menu_item_variants'
      AND column_name = 'variant_type'
  ) THEN
    ALTER TABLE public.merchant_menu_item_variants
      ADD COLUMN variant_type text NULL;
    COMMENT ON COLUMN public.merchant_menu_item_variants.variant_type IS 'Title for variant group (e.g. Size, Topping).';
  END IF;
END $$;
