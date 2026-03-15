-- POS (Point of Sale) integration per store.
-- Merchant chooses partner POS and optional store ID; integration becomes active after partner initiates.
-- Use BIGSERIAL so the sequence is created automatically with the table (avoids relation does not exist error).

CREATE TABLE IF NOT EXISTS public.merchant_store_pos_integration (
  id bigserial NOT NULL,
  store_id bigint NOT NULL,
  pos_partner text NOT NULL,
  pos_store_id text,
  status text NOT NULL DEFAULT 'PENDING',
  activated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_store_pos_integration_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_store_pos_integration_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_pos_integration_store_id_key
  ON public.merchant_store_pos_integration (store_id);

COMMENT ON TABLE public.merchant_store_pos_integration IS 'POS integration config per store; status PENDING until partner initiates, then ACTIVE';
COMMENT ON COLUMN public.merchant_store_pos_integration.pos_partner IS 'Partner POS identifier (e.g. partner name/code)';
COMMENT ON COLUMN public.merchant_store_pos_integration.pos_store_id IS 'Optional store ID in POS system';
COMMENT ON COLUMN public.merchant_store_pos_integration.status IS 'PENDING | ACTIVE | DISABLED';
