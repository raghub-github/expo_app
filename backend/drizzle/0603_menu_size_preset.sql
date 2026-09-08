-- Optional Regular / Standard / Premium size labels for purchasable menu sizes.
-- Additive only: nullable TEXT, no default, no backfill, no table rewrite.
-- NULL = Manual (existing size + unit columns unchanged).

ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS size_preset TEXT;

ALTER TABLE public.merchant_menu_item_variants
  ADD COLUMN IF NOT EXISTS size_preset TEXT;

ALTER TABLE public.merchant_menu_item_addons
  ADD COLUMN IF NOT EXISTS size_preset TEXT;

COMMENT ON COLUMN public.merchant_menu_items.size_preset IS
  'Optional size label: REGULAR, STANDARD, PREMIUM. NULL = manual item_size_value/unit.';
COMMENT ON COLUMN public.merchant_menu_item_variants.size_preset IS
  'Optional size label: REGULAR, STANDARD, PREMIUM. NULL = manual variant_size_value/unit.';
COMMENT ON COLUMN public.merchant_menu_item_addons.size_preset IS
  'Optional size label: REGULAR, STANDARD, PREMIUM. NULL = manual addon_size_value/unit.';

DO $$
BEGIN
  ALTER TABLE public.merchant_menu_items
    ADD CONSTRAINT merchant_menu_items_size_preset_chk
    CHECK (size_preset IS NULL OR size_preset IN ('REGULAR', 'STANDARD', 'PREMIUM'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.merchant_menu_item_variants
    ADD CONSTRAINT merchant_menu_item_variants_size_preset_chk
    CHECK (size_preset IS NULL OR size_preset IN ('REGULAR', 'STANDARD', 'PREMIUM'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.merchant_menu_item_addons
    ADD CONSTRAINT merchant_menu_item_addons_size_preset_chk
    CHECK (size_preset IS NULL OR size_preset IN ('REGULAR', 'STANDARD', 'PREMIUM'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New column is all-NULL; VALIDATE is a metadata-confirmed scan of NULL-only values.
-- Skip if a table is unexpectedly huge (still safe: NOT VALID still checks new writes).
DO $$
DECLARE
  item_n bigint;
  var_n bigint;
  addon_n bigint;
BEGIN
  SELECT reltuples::bigint INTO item_n FROM pg_class WHERE oid = 'public.merchant_menu_items'::regclass;
  SELECT reltuples::bigint INTO var_n FROM pg_class WHERE oid = 'public.merchant_menu_item_variants'::regclass;
  SELECT reltuples::bigint INTO addon_n FROM pg_class WHERE oid = 'public.merchant_menu_item_addons'::regclass;

  IF COALESCE(item_n, 0) < 500000 THEN
    ALTER TABLE public.merchant_menu_items VALIDATE CONSTRAINT merchant_menu_items_size_preset_chk;
  END IF;
  IF COALESCE(var_n, 0) < 500000 THEN
    ALTER TABLE public.merchant_menu_item_variants VALIDATE CONSTRAINT merchant_menu_item_variants_size_preset_chk;
  END IF;
  IF COALESCE(addon_n, 0) < 500000 THEN
    ALTER TABLE public.merchant_menu_item_addons VALIDATE CONSTRAINT merchant_menu_item_addons_size_preset_chk;
  END IF;
END $$;
