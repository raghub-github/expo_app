-- Rollback 0636_flash_sale_customer_store_campaign.sql

DROP INDEX IF EXISTS public.flash_sale_redemptions_customer_store_offer_active_uidx;
DROP INDEX IF EXISTS public.flash_sale_redemptions_customer_offer_nostore_active_uidx;
DROP INDEX IF EXISTS public.flash_sale_redemptions_customer_store_status_idx;

CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_customer_offer_active_uidx
  ON public.flash_sale_redemptions (customer_id, platform_offer_id)
  WHERE status IN ('reserved', 'consumed');

COMMENT ON TABLE public.flash_sale_redemptions IS
  'Immutable Flash Sale redemption snapshots. Active unique (customer_id, platform_offer_id) enforces one use per customer per offer.';
