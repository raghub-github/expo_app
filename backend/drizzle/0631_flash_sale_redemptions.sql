-- Flash Sale immutable redemption ledger.
-- Additive: does not alter catalogue prices, merchant CTC, or Fare Engine tables.
-- One active redemption per (customer, offer). Retries are idempotent per (offer, order).

CREATE TABLE IF NOT EXISTS public.flash_sale_redemptions (
  id                    bigserial PRIMARY KEY,
  platform_offer_id     bigint NOT NULL REFERENCES public.billing_platform_offers(id) ON DELETE CASCADE,
  offer_kind            text NOT NULL DEFAULT 'FLASH_SALE',
  service_type          text NOT NULL DEFAULT 'FOOD',
  store_id              bigint,
  item_ids              jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_id           bigint NOT NULL,
  order_id              bigint,
  order_id_text         text,
  original_item_price   numeric(14, 4),
  flash_sale_price      numeric(14, 4),
  subsidy_amount        numeric(14, 4) NOT NULL DEFAULT 0,
  campaign_budget_total numeric(14, 4),
  consumed_budget       numeric(14, 4) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'reserved',
  idempotency_key       text,
  snapshot_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at            timestamptz NOT NULL DEFAULT now(),
  consumed_at           timestamptz,
  cancelled_at          timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sale_redemptions_status_chk
    CHECK (status IN ('reserved', 'consumed', 'cancelled', 'refunded', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_customer_offer_active_uidx
  ON public.flash_sale_redemptions (customer_id, platform_offer_id)
  WHERE status IN ('reserved', 'consumed');

CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_offer_order_uidx
  ON public.flash_sale_redemptions (platform_offer_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_offer_order_text_uidx
  ON public.flash_sale_redemptions (platform_offer_id, order_id_text)
  WHERE order_id_text IS NOT NULL AND length(trim(order_id_text)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_idempotency_uidx
  ON public.flash_sale_redemptions (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;

CREATE INDEX IF NOT EXISTS flash_sale_redemptions_offer_applied_idx
  ON public.flash_sale_redemptions (platform_offer_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS flash_sale_redemptions_customer_status_idx
  ON public.flash_sale_redemptions (customer_id, status);

COMMENT ON TABLE public.flash_sale_redemptions IS
  'Immutable Flash Sale redemption snapshots. Active unique (customer_id, platform_offer_id) enforces one use per customer per offer. Cancel/refund restore follows billing_platform_offers.restore_on_* flags.';
COMMENT ON COLUMN public.flash_sale_redemptions.subsidy_amount IS
  'Platform-funded promotional cost = original customer price − Flash Sale price (× qty). Not the customer payment.';
COMMENT ON COLUMN public.flash_sale_redemptions.original_item_price IS
  'Runtime original customer unit at redemption. Catalogue selling_price is never mutated.';
