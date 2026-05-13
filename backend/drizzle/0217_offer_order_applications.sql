-- Migration 0217: Create offer_order_applications table
-- Immutable snapshot of every offer applied at order placement time.
-- Protects against retroactive offer edits invalidating order history.

CREATE TABLE IF NOT EXISTS offer_order_applications (
  id                BIGSERIAL     PRIMARY KEY,
  order_id          BIGINT        NOT NULL,
  offer_source      TEXT          NOT NULL,
  merchant_offer_id BIGINT        NULL REFERENCES merchant_offers(id) ON DELETE SET NULL,
  platform_offer_id BIGINT        NULL REFERENCES billing_platform_offers(id) ON DELETE SET NULL,
  offer_type        TEXT          NOT NULL,
  offer_title       TEXT          NOT NULL,
  coupon_code       TEXT          NULL,
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_share    NUMERIC(10,2) NOT NULL DEFAULT 0,
  merchant_share    NUMERIC(10,2) NOT NULL DEFAULT 0,
  funding_mode      TEXT          NOT NULL DEFAULT 'MERCHANT_ONLY',
  snapshot_json     JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT offer_order_applications_source_chk CHECK (
    offer_source IN ('MERCHANT','PLATFORM','COUPON')
  ),
  CONSTRAINT offer_order_applications_funding_mode_chk CHECK (
    funding_mode IN ('PLATFORM_ONLY','MERCHANT_ONLY','CO_FUNDED','PLATFORM_SHARE')
  )
);

CREATE INDEX IF NOT EXISTS offer_order_applications_order_id_idx
  ON offer_order_applications(order_id);

CREATE INDEX IF NOT EXISTS offer_order_applications_merchant_offer_id_idx
  ON offer_order_applications(merchant_offer_id) WHERE merchant_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS offer_order_applications_platform_offer_id_idx
  ON offer_order_applications(platform_offer_id) WHERE platform_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS offer_order_applications_offer_source_idx
  ON offer_order_applications(offer_source);

CREATE INDEX IF NOT EXISTS offer_order_applications_created_at_idx
  ON offer_order_applications(created_at DESC);

COMMENT ON TABLE offer_order_applications IS 'Immutable record of every discount applied at order placement. snapshot_json stores the full offer row at time of order so history is preserved even if offers change.';
COMMENT ON COLUMN offer_order_applications.offer_source     IS 'MERCHANT = store offer, PLATFORM = billing_platform_offers, COUPON = billing_discounts promo code';
COMMENT ON COLUMN offer_order_applications.platform_share   IS 'Amount of discount funded by the platform (INR)';
COMMENT ON COLUMN offer_order_applications.merchant_share   IS 'Amount of discount funded by the merchant (INR)';
COMMENT ON COLUMN offer_order_applications.snapshot_json    IS 'Full offer row snapshot at time of order placement';
