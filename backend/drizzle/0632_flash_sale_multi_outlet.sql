-- FLASH_SALE multi-outlet support (I/O-safe).
-- merchant_ids is already jsonb[]; no rewrite of existing rows.
-- Documents multi-outlet FLASH_SALE and adds a narrow partial index for active flash offers.

COMMENT ON COLUMN public.billing_platform_offers.merchant_ids IS
  'Allow-listed merchant_stores.id values. FLASH_SALE supports one or many outlets; conditions.flash_sale_items lists menu item PKs (optionally with store_id) across those outlets.';

CREATE INDEX IF NOT EXISTS billing_platform_offers_flash_sale_active_idx
  ON public.billing_platform_offers (is_active, id)
  WHERE is_active = TRUE
    AND COALESCE(is_hidden, FALSE) = FALSE
    AND upper(offer_kind) = 'FLASH_SALE';
