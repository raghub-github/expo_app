-- Rider delivery payout rate cards (separate from customer geo pricing).
-- Resolution walks geo_pricing_chain_steps from current node toward state (nearest active rule wins).

CREATE TABLE IF NOT EXISTS rider_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level geo_pricing_level NOT NULL,
  ref_id uuid NOT NULL,
  service_type geo_service NOT NULL,
  base_fare numeric(14, 4) NOT NULL DEFAULT 0,
  per_km_rate numeric(14, 6) NOT NULL DEFAULT 0,
  min_distance_km numeric(14, 4) NOT NULL DEFAULT 0,
  max_distance_km numeric(14, 4),
  waiting_charge_per_min numeric(14, 6) NOT NULL DEFAULT 0,
  surge_multiplier numeric(14, 6) NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_rate_cards_level_ref_service_unique UNIQUE (level, ref_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_rider_rate_cards_service_level_ref
  ON rider_rate_cards (service_type, level, ref_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_rider_rate_cards_active ON rider_rate_cards (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_rider_rate_cards_priority ON rider_rate_cards (priority DESC);

CREATE OR REPLACE FUNCTION rider_rate_cards_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rider_rate_cards_updated ON rider_rate_cards;
CREATE TRIGGER trg_rider_rate_cards_updated
  BEFORE UPDATE ON rider_rate_cards
  FOR EACH ROW
  EXECUTE FUNCTION rider_rate_cards_set_updated_at();

-- One row per (level, ref, service): first matching step in chain (current → state) wins.
CREATE OR REPLACE FUNCTION geo_effective_rider_rate_card_detail(
  p_level geo_pricing_level,
  p_id uuid,
  p_service geo_service
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  rec record;
  card_id uuid;
  card rider_rate_cards%ROWTYPE;
BEGIN
  FOR rec IN
    SELECT * FROM geo_pricing_chain_steps(p_level, p_id) ORDER BY step_ord ASC
  LOOP
    SELECT r.id INTO card_id
    FROM rider_rate_cards r
    WHERE r.level = rec.step_level
      AND r.ref_id = rec.step_id
      AND r.service_type = p_service
      AND r.is_active = true
    ORDER BY r.priority DESC, r.updated_at DESC
    LIMIT 1;

    IF card_id IS NOT NULL THEN
      SELECT * INTO card FROM rider_rate_cards WHERE id = card_id;
      RETURN jsonb_build_object(
        'id', card.id,
        'base_fare', to_jsonb(card.base_fare),
        'per_km_rate', to_jsonb(card.per_km_rate),
        'min_distance_km', to_jsonb(card.min_distance_km),
        'max_distance_km', to_jsonb(card.max_distance_km),
        'waiting_charge_per_min', to_jsonb(card.waiting_charge_per_min),
        'surge_multiplier', to_jsonb(card.surge_multiplier),
        'priority', card.priority,
        'override', card.override,
        'applied_level', rec.step_level::text,
        'applied_ref_id', rec.step_id,
        'is_inherited', (rec.step_ord > 1),
        'step_ord', rec.step_ord
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION geo_effective_rider_rate_summaries(
  p_level geo_pricing_level,
  p_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'food', geo_effective_rider_rate_card_detail(p_level, p_id, 'food'::geo_service),
    'parcel', geo_effective_rider_rate_card_detail(p_level, p_id, 'parcel'::geo_service),
    'ride', geo_effective_rider_rate_card_detail(p_level, p_id, 'ride'::geo_service)
  ));
$$;

-- Resolve by pincode string → effective card + sample payout (base + distance + waiting) * surge
CREATE OR REPLACE FUNCTION geo_resolve_rider_payout(
  p_pincode text,
  p_service geo_service,
  p_distance_km numeric,
  p_waiting_min numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pid uuid;
  v_detail jsonb;
  v_base numeric;
  v_km numeric;
  v_wait numeric;
  v_surge numeric;
  v_min_d numeric;
  v_max_d numeric;
  v_subtotal numeric;
  v_total numeric;
BEGIN
  SELECT p.id INTO v_pid
  FROM pincodes p
  WHERE p.pincode = trim(p_pincode)
  LIMIT 1;

  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('found', false, 'error', 'pincode_not_found');
  END IF;

  v_detail := geo_effective_rider_rate_card_detail('pincode'::geo_pricing_level, v_pid, p_service);

  IF v_detail IS NULL THEN
    RETURN jsonb_build_object(
      'found', true,
      'pincode_id', v_pid,
      'service', p_service::text,
      'card', NULL,
      'payout', NULL,
      'message', 'no_rider_rate_card'
    );
  END IF;

  v_base := (v_detail->>'base_fare')::numeric;
  v_km := (v_detail->>'per_km_rate')::numeric;
  v_wait := (v_detail->>'waiting_charge_per_min')::numeric;
  v_surge := (v_detail->>'surge_multiplier')::numeric;
  v_min_d := coalesce((v_detail->>'min_distance_km')::numeric, 0);
  v_max_d := CASE WHEN v_detail ? 'max_distance_km' AND v_detail->'max_distance_km' IS NOT NULL AND jsonb_typeof(v_detail->'max_distance_km') != 'null'
    THEN (v_detail->>'max_distance_km')::numeric ELSE NULL END;

  IF v_max_d IS NOT NULL AND p_distance_km > v_max_d THEN
    RETURN jsonb_build_object(
      'found', true,
      'pincode_id', v_pid,
      'service', p_service::text,
      'card', v_detail,
      'payout', NULL,
      'message', 'distance_above_max'
    );
  END IF;

  IF p_distance_km < v_min_d THEN
    v_subtotal := v_base + (v_min_d * v_km) + (coalesce(p_waiting_min, 0) * v_wait);
  ELSE
    v_subtotal := v_base + (p_distance_km * v_km) + (coalesce(p_waiting_min, 0) * v_wait);
  END IF;

  v_total := v_subtotal * coalesce(nullif(v_surge, 0), 1);

  RETURN jsonb_build_object(
    'found', true,
    'pincode_id', v_pid,
    'service', p_service::text,
    'card', v_detail,
    'distance_km', p_distance_km,
    'waiting_min', coalesce(p_waiting_min, 0),
    'subtotal_before_surge', v_subtotal,
    'payout', v_total,
    'surge_multiplier', coalesce(nullif(v_surge, 0), 1)
  );
END;
$$;

COMMENT ON TABLE rider_rate_cards IS 'Rider payout rate cards per geo level; separate from customer pricing.';
