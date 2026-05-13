-- Migration 0216: Create merchant_offer_usages table
-- Tracks per-user, per-order offer redemptions so max_uses_per_user can be enforced.

CREATE TABLE IF NOT EXISTS merchant_offer_usages (
  id              BIGSERIAL PRIMARY KEY,
  offer_id        BIGINT        NOT NULL REFERENCES merchant_offers(id) ON DELETE CASCADE,
  user_id         BIGINT        NOT NULL,
  order_id        BIGINT        NULL,
  used_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_reversed     BOOLEAN       NOT NULL DEFAULT FALSE,
  reversed_at     TIMESTAMPTZ   NULL,
  CONSTRAINT merchant_offer_usages_offer_user_order_uq
    UNIQUE (offer_id, user_id, order_id)
);

CREATE INDEX IF NOT EXISTS merchant_offer_usages_offer_id_idx
  ON merchant_offer_usages(offer_id);

CREATE INDEX IF NOT EXISTS merchant_offer_usages_user_id_idx
  ON merchant_offer_usages(user_id);

CREATE INDEX IF NOT EXISTS merchant_offer_usages_order_id_idx
  ON merchant_offer_usages(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_offer_usages_offer_user_idx
  ON merchant_offer_usages(offer_id, user_id);

COMMENT ON TABLE merchant_offer_usages IS 'Per-user, per-order usage log for merchant_offers. Used to enforce max_uses_per_user and support refund reversal.';
COMMENT ON COLUMN merchant_offer_usages.order_id   IS 'Set after order is confirmed. NULL during quote/pre-confirmation phase.';
COMMENT ON COLUMN merchant_offer_usages.is_reversed IS 'Set TRUE when the order is refunded/cancelled and discount is reversed.';
