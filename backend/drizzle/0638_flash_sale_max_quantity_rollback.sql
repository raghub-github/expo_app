-- Rollback: drop max_flash_quantity from FLASH_SALE conditions only.
UPDATE public.billing_platform_offers
SET conditions = conditions - 'max_flash_quantity',
    updated_at = NOW()
WHERE UPPER(offer_kind) = 'FLASH_SALE'
  AND conditions ? 'max_flash_quantity';
