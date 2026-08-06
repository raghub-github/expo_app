-- Platform checkout coupon engine: coupon_config, geo bindings, usage ledger.
-- Mirror: backend/drizzle/0496_checkout_coupon_engine.sql
-- Idempotent / backward compatible / does not touch store offer tables.

-- ---------------------------------------------------------------------------
-- billing_discounts.coupon_config
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_discounts
  ADD COLUMN IF NOT EXISTS coupon_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.billing_discounts.coupon_config IS
  'Checkout coupon engine config (usage_mode, service_types, coupon_type, behaviour, restrictions). Store offers untouched.';

UPDATE public.billing_discounts
SET coupon_config = '{}'::jsonb
WHERE coupon_config IS NULL;

-- ---------------------------------------------------------------------------
-- geo_billing_discount_bindings (same visibility model as platform offers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geo_billing_discount_bindings (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  billing_discount_id bigint NOT NULL REFERENCES public.billing_discounts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geo_level, geo_ref_id, billing_discount_id)
);

CREATE INDEX IF NOT EXISTS geo_billing_discount_bindings_geo_idx
  ON public.geo_billing_discount_bindings (geo_level, geo_ref_id);
CREATE INDEX IF NOT EXISTS geo_billing_discount_bindings_discount_idx
  ON public.geo_billing_discount_bindings (billing_discount_id);

CREATE OR REPLACE FUNCTION public.geo_billing_discount_ids_effective_for_location(
  p_level geo_pricing_level,
  p_id uuid
) RETURNS bigint[]
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    array_agg(x.id ORDER BY x.id ASC),
    ARRAY[]::bigint[]
  )
  FROM (
    SELECT DISTINCT ON (d.id) d.id
    FROM geo_pricing_chain_steps(p_level, p_id) c
    INNER JOIN geo_billing_discount_bindings b
      ON b.geo_level = c.step_level AND b.geo_ref_id = c.step_id
    INNER JOIN billing_discounts d
      ON d.id = b.billing_discount_id AND d.is_active = true
    ORDER BY d.id, c.step_ord ASC
  ) x;
$$;

COMMENT ON FUNCTION public.geo_billing_discount_ids_effective_for_location(geo_pricing_level, uuid) IS
  'Active checkout coupons bound on the geo chain for a location. Unmapped coupons never appear.';

-- ---------------------------------------------------------------------------
-- billing_discount_usages — per-customer redemption ledger for usage rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_discount_usages (
  id                  bigserial PRIMARY KEY,
  billing_discount_id bigint NOT NULL REFERENCES public.billing_discounts(id) ON DELETE CASCADE,
  customer_id         bigint NOT NULL,
  order_id            bigint,
  order_id_text       text,
  status              text NOT NULL DEFAULT 'reserved',
  applied_at          timestamptz NOT NULL DEFAULT now(),
  consumed_at         timestamptz,
  cancelled_at        timestamptz,
  refunded_at         timestamptz,
  discount_amount     numeric(14, 4) NOT NULL DEFAULT 0,
  usage_count         integer NOT NULL DEFAULT 1,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_discount_usages_status_chk
    CHECK (status IN ('reserved', 'consumed', 'cancelled', 'refunded', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_discount_usages_discount_order_uidx
  ON public.billing_discount_usages (billing_discount_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_discount_usages_discount_order_text_uidx
  ON public.billing_discount_usages (billing_discount_id, order_id_text)
  WHERE order_id_text IS NOT NULL AND length(trim(order_id_text)) > 0;

CREATE INDEX IF NOT EXISTS billing_discount_usages_discount_customer_idx
  ON public.billing_discount_usages (billing_discount_id, customer_id);

CREATE INDEX IF NOT EXISTS billing_discount_usages_customer_status_idx
  ON public.billing_discount_usages (customer_id, status);

CREATE INDEX IF NOT EXISTS billing_discount_usages_applied_at_idx
  ON public.billing_discount_usages (billing_discount_id, customer_id, applied_at DESC);
