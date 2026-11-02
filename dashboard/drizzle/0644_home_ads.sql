-- Home Ads: Super Admin CMS banners for customer / rider / merchant apps.
-- Shown on Home + Orders when enabled. Lean schema — one row per ad, partial index for reads.
CREATE TABLE IF NOT EXISTS public.home_ads (
  id bigserial PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('customer', 'rider', 'merchant')),
  -- home | orders | both
  placement text NOT NULL DEFAULT 'both'
    CHECK (placement IN ('home', 'orders', 'both')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_r2_key text,
  image_proxy_url text,
  cta_label text,
  cta_url text,
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hot path: apps only load enabled ads for one audience.
CREATE INDEX IF NOT EXISTS idx_home_ads_audience_enabled_sort
  ON public.home_ads (audience, sort_order, id)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_home_ads_audience_admin
  ON public.home_ads (audience, sort_order, id);

COMMENT ON TABLE public.home_ads IS
  'CMS home/order ad cards. Apps fetch only enabled rows for their audience.';
