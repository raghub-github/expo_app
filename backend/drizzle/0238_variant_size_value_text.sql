-- Allow variant size as text (e.g. "500", "1500-1700") not only numeric.

ALTER TABLE merchant_menu_item_variants
  ALTER COLUMN variant_size_value TYPE TEXT
  USING CASE
    WHEN variant_size_value IS NULL THEN NULL
    ELSE trim(variant_size_value::text)
  END;

COMMENT ON COLUMN merchant_menu_item_variants.variant_size_value IS
  'Optional portion label: single amount (500) or range (1500-1700).';
