-- Geo Super Admin: bind platform offers to hierarchy nodes; effective set merges up the chain (closest wins per offer id).

CREATE TABLE geo_platform_offer_bindings (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  platform_offer_id bigint NOT NULL REFERENCES billing_platform_offers (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geo_level, geo_ref_id, platform_offer_id)
);

CREATE INDEX geo_platform_offer_bindings_geo_idx ON geo_platform_offer_bindings (geo_level, geo_ref_id);
CREATE INDEX geo_platform_offer_bindings_offer_idx ON geo_platform_offer_bindings (platform_offer_id);

CREATE OR REPLACE FUNCTION geo_platform_offer_setup_summary(
  p_discount_type text,
  p_value_numeric numeric,
  p_delivery_discount_type text,
  p_offer_kind text,
  p_buy_qty integer,
  p_get_qty integer
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  s := coalesce(nullif(trim(p_offer_kind), ''), 'DISCOUNT');
  IF p_discount_type IS NOT NULL AND p_value_numeric IS NOT NULL THEN
    s := s || ' · ' || p_discount_type || ' ' || trim(to_char(p_value_numeric, 'FM999999990.0999'));
  END IF;
  IF p_delivery_discount_type IS NOT NULL AND btrim(p_delivery_discount_type) <> '' THEN
    s := s || ' · deliv ' || p_delivery_discount_type;
  END IF;
  IF p_buy_qty IS NOT NULL AND p_get_qty IS NOT NULL AND p_buy_qty >= 1 AND p_get_qty >= 1 THEN
    s := s || ' · buy/get ' || p_buy_qty::text || '/' || p_get_qty::text;
  END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION geo_effective_platform_offers_json(
  p_level geo_pricing_level,
  p_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'platform_offer_id', x.id,
        'name', x.name,
        'service_type', x.service_type,
        'offer_audience', x.offer_audience,
        'offer_kind', x.offer_kind,
        'offer_setup_summary', geo_platform_offer_setup_summary(
          x.discount_type,
          x.value_numeric,
          x.delivery_discount_type,
          x.offer_kind,
          x.buy_qty,
          x.get_qty
        ),
        'applied_level', x.applied_level,
        'applied_ref_id', x.applied_ref_id,
        'is_inherited', (
          x.applied_level IS DISTINCT FROM p_level::text
          OR x.applied_ref_id IS DISTINCT FROM p_id::text
        )
      )
      ORDER BY x.priority ASC NULLS LAST, x.id ASC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT ON (o.id)
      o.id,
      o.name,
      o.service_type,
      o.offer_audience,
      o.offer_kind,
      o.discount_type,
      o.value_numeric,
      o.delivery_discount_type,
      o.buy_qty,
      o.get_qty,
      o.priority,
      c.step_level::text AS applied_level,
      c.step_id::text AS applied_ref_id
    FROM geo_pricing_chain_steps(p_level, p_id) c
    INNER JOIN geo_platform_offer_bindings b
      ON b.geo_level = c.step_level AND b.geo_ref_id = c.step_id
    INNER JOIN billing_platform_offers o
      ON o.id = b.platform_offer_id AND o.is_active = true
    ORDER BY o.id, c.step_ord ASC
  ) x;
$$;

CREATE OR REPLACE FUNCTION geo_platform_offer_ids_effective_for_location(
  p_level geo_pricing_level,
  p_id uuid
) RETURNS bigint[]
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    array_agg(x.id ORDER BY x.priority ASC NULLS LAST, x.id ASC),
    ARRAY[]::bigint[]
  )
  FROM (
    SELECT DISTINCT ON (o.id) o.id, o.priority
    FROM geo_pricing_chain_steps(p_level, p_id) c
    INNER JOIN geo_platform_offer_bindings b
      ON b.geo_level = c.step_level AND b.geo_ref_id = c.step_id
    INNER JOIN billing_platform_offers o
      ON o.id = b.platform_offer_id AND o.is_active = true
    ORDER BY o.id, c.step_ord ASC
  ) x;
$$;

-- Sanity (manual): state-bound offer appears on child rows via geo_effective_platform_offers_json;
-- duplicate offer id on a farther ancestor is ignored when a closer step already bound that id (DISTINCT ON + step_ord).
