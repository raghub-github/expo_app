-- Modern GatiMitra offer engine fields on billing_platform_offers.
-- Supports: independent platform offers + hybrid (platform + merchant split), geo hierarchy targeting,
-- single-best selection, campaign windows, and richer offer kinds.

ALTER TABLE billing_platform_offers
  ADD COLUMN IF NOT EXISTS offer_kind text NOT NULL DEFAULT 'DISCOUNT',
  ADD COLUMN IF NOT EXISTS funding_mode text NOT NULL DEFAULT 'PLATFORM_ONLY',
  ADD COLUMN IF NOT EXISTS platform_share_pct numeric(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS merchant_share_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_platform_contribution numeric(14,4),
  ADD COLUMN IF NOT EXISTS max_merchant_contribution numeric(14,4),
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS geo_level text,
  ADD COLUMN IF NOT EXISTS geo_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS merchant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_segment text NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS min_order_amount numeric(14,4),
  ADD COLUMN IF NOT EXISTS max_discount_amount numeric(14,4),
  ADD COLUMN IF NOT EXISTS buy_qty integer,
  ADD COLUMN IF NOT EXISTS get_qty integer,
  ADD COLUMN IF NOT EXISTS is_stackable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusion_group text,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_total numeric(14,4),
  ADD COLUMN IF NOT EXISTS budget_used numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_offer_kind_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_funding_mode_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_target_scope_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_customer_segment_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_share_pct_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_time_window_chk,
  DROP CONSTRAINT IF EXISTS billing_platform_offers_budget_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_offer_kind_chk
    CHECK (offer_kind IN ('DISCOUNT','COUPON','FREE_DELIVERY','FLAT_DISCOUNT','BUY_X_GET_Y','CASHBACK')),
  ADD CONSTRAINT billing_platform_offers_funding_mode_chk
    CHECK (funding_mode IN ('PLATFORM_ONLY','HYBRID')),
  ADD CONSTRAINT billing_platform_offers_target_scope_chk
    CHECK (target_scope IN ('GLOBAL','GEO','MERCHANT','GEO_MERCHANT')),
  ADD CONSTRAINT billing_platform_offers_customer_segment_chk
    CHECK (customer_segment IN ('ALL','NEW','EXISTING')),
  ADD CONSTRAINT billing_platform_offers_share_pct_chk
    CHECK (
      platform_share_pct >= 0 AND merchant_share_pct >= 0
      AND platform_share_pct <= 100 AND merchant_share_pct <= 100
      AND round(platform_share_pct + merchant_share_pct, 2) = 100
    ),
  ADD CONSTRAINT billing_platform_offers_time_window_chk
    CHECK (ends_at IS NULL OR starts_at IS NULL OR starts_at <= ends_at),
  ADD CONSTRAINT billing_platform_offers_budget_chk
    CHECK (budget_total IS NULL OR budget_total >= 0);

CREATE INDEX IF NOT EXISTS billing_platform_offers_service_scope_active_idx
  ON billing_platform_offers (service_type, target_scope, is_active, priority);
CREATE INDEX IF NOT EXISTS billing_platform_offers_time_window_idx
  ON billing_platform_offers (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS billing_platform_offers_segment_idx
  ON billing_platform_offers (customer_segment, is_active);
CREATE INDEX IF NOT EXISTS billing_platform_offers_geo_ids_gin_idx
  ON billing_platform_offers USING gin (geo_ids);
CREATE INDEX IF NOT EXISTS billing_platform_offers_merchant_ids_gin_idx
  ON billing_platform_offers USING gin (merchant_ids);
