-- Rollback for 0407_merchant_offers_canonical_cleanup.sql
-- Recreates dropped legacy scaffolding tables only.
-- Does not undo column/data alignment or drop helper functions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.merchant_offer_conditions (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL,
  condition_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_offer_conditions_offer_id_idx
  ON public.merchant_offer_conditions(offer_id);

CREATE TABLE IF NOT EXISTS public.merchant_offer_usage (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  user_id BIGINT,
  order_id BIGINT,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_usage_offer_user
  ON public.merchant_offer_usage(offer_id, user_id);

CREATE INDEX IF NOT EXISTS idx_offer_usage_offer_id
  ON public.merchant_offer_usage(offer_id);

COMMIT;
