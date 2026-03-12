-- 0123_merchant_store_self_delivery_riders.sql
-- Self-delivery riders linked to merchant stores (Supabase Postgres for dashboard).

CREATE TABLE IF NOT EXISTS public.merchant_store_self_delivery_riders (
  id BIGSERIAL NOT NULL,
  store_id BIGINT NOT NULL REFERENCES merchant_stores (id) ON DELETE CASCADE,
  rider_name TEXT NOT NULL,
  rider_mobile TEXT NOT NULL,
  rider_email TEXT NULL,
  vehicle_number TEXT NULL,
  is_primary BOOLEAN NULL DEFAULT FALSE,
  is_active BOOLEAN NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_store_self_delivery_riders_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS merchant_store_self_delivery_riders_store_id_idx
  ON public.merchant_store_self_delivery_riders USING BTREE (store_id);

CREATE INDEX IF NOT EXISTS merchant_store_self_delivery_riders_is_active_idx
  ON public.merchant_store_self_delivery_riders USING BTREE (store_id, is_active)
  WHERE (is_active = TRUE);

