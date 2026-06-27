-- One-time shareable delivery address links (24h TTL, Zomato-style).

CREATE TABLE IF NOT EXISTS public.address_share_links (
  id                    BIGSERIAL PRIMARY KEY,
  token                 TEXT NOT NULL UNIQUE,
  short_code            TEXT NOT NULL,
  sharer_customer_id    BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  source_address_id     BIGINT REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  full_address          TEXT NOT NULL,
  label                 TEXT,
  landmark              TEXT,
  city                  TEXT,
  state                 TEXT,
  postal_code           TEXT,
  country               TEXT DEFAULT 'IN',
  latitude              NUMERIC(10, 8) NOT NULL,
  longitude             NUMERIC(11, 8) NOT NULL,
  contact_name          TEXT,
  contact_mobile        TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  claimed_at            TIMESTAMPTZ,
  claimed_by_customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS address_share_links_short_token_idx
  ON public.address_share_links(short_code, token);

CREATE INDEX IF NOT EXISTS address_share_links_expires_idx
  ON public.address_share_links(expires_at);

CREATE INDEX IF NOT EXISTS address_share_links_sharer_idx
  ON public.address_share_links(sharer_customer_id, created_at DESC);

COMMENT ON TABLE public.address_share_links IS 'One-time customer address share tokens; 24h TTL.';
COMMENT ON COLUMN public.address_share_links.token IS 'Public id query param (?id=...)';
COMMENT ON COLUMN public.address_share_links.short_code IS 'Short path segment for pretty URLs.';
