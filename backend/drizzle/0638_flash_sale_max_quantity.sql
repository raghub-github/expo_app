-- FLASH_SALE: cap eligible item quantity per order (default 1).
-- Stored on existing billing_platform_offers.conditions JSON next to flash_sale_items.
-- Non-FLASH_SALE offers are untouched.

UPDATE public.billing_platform_offers
SET conditions = COALESCE(conditions, '{}'::jsonb) || jsonb_build_object('max_flash_quantity', 1),
    updated_at = NOW()
WHERE UPPER(offer_kind) = 'FLASH_SALE'
  AND (
    conditions->>'max_flash_quantity' IS NULL
    OR btrim(conditions->>'max_flash_quantity') = ''
    OR conditions->>'max_flash_quantity' !~ '^[0-9]+$'
    OR (conditions->>'max_flash_quantity')::int < 1
  );
