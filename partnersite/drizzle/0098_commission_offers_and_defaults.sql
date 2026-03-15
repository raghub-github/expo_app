-- ============================================================================
-- Platform commission defaults (admin-set: default %, GST on commission %, etc.)
-- Used during onboarding and when no store-specific rule/offer applies.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_commission_defaults (
  id BIGSERIAL PRIMARY KEY,
  commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 15 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  gst_on_commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 18 CHECK (gst_on_commission_percentage >= 0 AND gst_on_commission_percentage <= 100),
  tds_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tds_percentage >= 0 AND tds_percentage <= 100),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.platform_commission_defaults IS 'Default commission and tax rates set from admin. Applied to all merchants when no store/parent rule or offer applies.';
COMMENT ON COLUMN public.platform_commission_defaults.gst_on_commission_percentage IS 'GST % applied on commission (e.g. 18). Shown in agreement and withdrawal calculation.';

CREATE INDEX IF NOT EXISTS platform_commission_defaults_effective_idx
  ON public.platform_commission_defaults(effective_from, effective_to);

-- ============================================================================
-- Commission offers (0% for X months, no commission on first ₹Y, etc.)
-- Managed from admin dashboard; one can be set as default for new merchants.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE commission_offer_type AS ENUM (
    'zero_commission_for_months',
    'zero_commission_up_to_amount',
    'fixed_percentage',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.commission_offers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  offer_type commission_offer_type NOT NULL DEFAULT 'fixed_percentage',

  -- config: e.g. { "months": 3 } for zero_commission_for_months, { "amount_cap": 10000 } for zero_commission_up_to_amount, { "commission_percentage": 10 } for fixed
  config JSONB NOT NULL DEFAULT '{}',

  -- After offer period/cap, this rate applies (e.g. 15)
  post_offer_commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 15 CHECK (post_offer_commission_percentage >= 0 AND post_offer_commission_percentage <= 100),

  -- Override platform default for GST on commission (null = use platform default)
  gst_on_commission_percentage NUMERIC(5, 2) CHECK (gst_on_commission_percentage IS NULL OR (gst_on_commission_percentage >= 0 AND gst_on_commission_percentage <= 100)),

  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.commission_offers IS 'Offer definitions: 0% for N months, 0% up to ₹X, or fixed %. Shown in agreement page and PDFs. Admin-managed.';
COMMENT ON COLUMN public.commission_offers.config IS 'JSON: months (int), amount_cap (number), or commission_percentage (number) depending on offer_type.';
COMMENT ON COLUMN public.commission_offers.is_default IS 'When true, this offer is applied to all new merchants during onboarding (unless overridden).';

CREATE INDEX IF NOT EXISTS commission_offers_valid_idx ON public.commission_offers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS commission_offers_is_default_idx ON public.commission_offers(is_default) WHERE is_default = TRUE;

-- ============================================================================
-- Merchant–offer link (which offer applies to which store/parent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_commission_offer (
  id BIGSERIAL PRIMARY KEY,
  merchant_store_id BIGINT,
  merchant_parent_id BIGINT,
  offer_id BIGINT NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_commission_offer_store_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT merchant_commission_offer_parent_fkey
    FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents(id) ON DELETE CASCADE,
  CONSTRAINT merchant_commission_offer_offer_fkey
    FOREIGN KEY (offer_id) REFERENCES public.commission_offers(id) ON DELETE CASCADE,
  CONSTRAINT merchant_commission_offer_store_or_parent_check
    CHECK (merchant_store_id IS NOT NULL OR merchant_parent_id IS NOT NULL)
);

COMMENT ON TABLE public.merchant_commission_offer IS 'Links a store or parent to a commission offer. Used for agreement text and to derive effective commission (with platform_commission_rules or offer logic).';

CREATE INDEX IF NOT EXISTS merchant_commission_offer_store_idx ON public.merchant_commission_offer(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_commission_offer_parent_idx ON public.merchant_commission_offer(merchant_parent_id) WHERE merchant_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_commission_offer_offer_idx ON public.merchant_commission_offer(offer_id);
CREATE INDEX IF NOT EXISTS merchant_commission_offer_effective_idx ON public.merchant_commission_offer(effective_from, effective_to);

-- ============================================================================
-- Seed one row of platform_commission_defaults (15% commission, 18% GST on commission)
-- ============================================================================

INSERT INTO public.platform_commission_defaults (
  commission_percentage,
  gst_on_commission_percentage,
  tds_percentage,
  effective_from
)
SELECT 15, 18, 0, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.platform_commission_defaults LIMIT 1);
