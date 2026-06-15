-- Live trip sharing — secure public tracking links (no login for viewers).

CREATE TABLE IF NOT EXISTS public.trip_share_links (
  id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS trip_share_links_trip_id_idx ON public.trip_share_links(trip_id);
CREATE INDEX IF NOT EXISTS trip_share_links_token_active_idx ON public.trip_share_links(token) WHERE is_active = true;

COMMENT ON TABLE public.trip_share_links IS 'Public live-trip share tokens; expires on trip end or max 24h.';
COMMENT ON COLUMN public.trip_share_links.trip_id IS 'Canonical orders_core.order_id text reference.';
COMMENT ON COLUMN public.trip_share_links.token IS 'Public URL token segment (e.g. GTL8F2A9B1C3D).';
