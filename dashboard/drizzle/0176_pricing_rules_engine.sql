-- Production-grade flexible pricing rule engine (customer + rider + surge + discount + commission).
-- Incentives / per-order bonuses are out of scope here — add later as separate rule_type or table.

DO $$ BEGIN
  CREATE TYPE pricing_rule_type AS ENUM (
    'customer_delivery_fee',
    'rider_payout',
    'surge_pricing',
    'discount',
    'commission'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type pricing_rule_type NOT NULL,
  service_type geo_service NOT NULL,
  level geo_pricing_level NOT NULL,
  ref_id uuid NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_service_level_ref
  ON pricing_rules (service_type, level, ref_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_rule_type
  ON pricing_rules (rule_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_priority
  ON pricing_rules (priority DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_conditions_gin
  ON pricing_rules USING gin (conditions jsonb_path_ops);

CREATE OR REPLACE FUNCTION pricing_rules_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_rules_updated ON pricing_rules;
CREATE TRIGGER trg_pricing_rules_updated
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION pricing_rules_set_updated_at();

COMMENT ON TABLE pricing_rules IS 'Unified rule engine: conditions + actions JSON; evaluated per geo chain + context.';

-- -----------------------------------------------------------------------------
-- Match JSON conditions against runtime context (distance, time, day, order value, flags).
-- p_ctx example: {"distance_km":4.2,"at":"2026-04-06T19:30:00+05:30","order_value":250,"rain":true,"traffic_level":"high"}
-- conditions example: {"min_distance_km":0,"max_distance_km":5,"time_range":["18:00","22:00"],"day_of_week":["fri"],"order_value_min":100,"rain":true}
-- Empty conditions {} always matches.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pricing_rule_conditions_match(p_conditions jsonb, p_ctx jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  km numeric;
  at_ts timestamptz;
  t time;
  tr0 text;
  tr1 text;
  t0 time;
  t1 time;
  dow text;
  ov numeric;
  need_rain boolean;
  ctx_rain boolean;
  want_traffic text;
  ctx_traffic text;
BEGIN
  IF p_conditions IS NULL OR p_conditions = '{}'::jsonb THEN
    RETURN true;
  END IF;

  km := NULL;
  IF p_ctx ? 'distance_km' AND p_ctx->'distance_km' IS NOT NULL AND jsonb_typeof(p_ctx->'distance_km') != 'null' THEN
    km := (p_ctx->>'distance_km')::numeric;
  END IF;

  IF p_conditions ? 'min_distance_km' THEN
    IF km IS NULL OR km < (p_conditions->>'min_distance_km')::numeric THEN
      RETURN false;
    END IF;
  END IF;

  IF p_conditions ? 'max_distance_km' AND p_conditions->'max_distance_km' IS NOT NULL AND jsonb_typeof(p_conditions->'max_distance_km') != 'null' THEN
    IF km IS NULL OR km > (p_conditions->>'max_distance_km')::numeric THEN
      RETURN false;
    END IF;
  END IF;

  IF p_conditions ? 'time_range' AND jsonb_typeof(p_conditions->'time_range') = 'array'
     AND jsonb_array_length(p_conditions->'time_range') >= 2 THEN
    tr0 := p_conditions->'time_range'->>0;
    tr1 := p_conditions->'time_range'->>1;
    IF tr0 IS NOT NULL AND tr1 IS NOT NULL AND length(tr0) >= 4 AND length(tr1) >= 4 THEN
      at_ts := coalesce((p_ctx->>'at')::timestamptz, now());
      t := at_ts::time;
      t0 := tr0::time;
      t1 := tr1::time;
      IF t0 <= t1 THEN
        IF NOT (t >= t0 AND t <= t1) THEN
          RETURN false;
        END IF;
      ELSE
        -- window crosses midnight
        IF NOT (t >= t0 OR t <= t1) THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_conditions ? 'day_of_week' AND jsonb_typeof(p_conditions->'day_of_week') = 'array' THEN
    at_ts := coalesce((p_ctx->>'at')::timestamptz, now());
    dow := lower(trim(to_char(at_ts, 'Dy')));
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_conditions->'day_of_week') AS el(x)
      WHERE lower(trim(el.x)) IN (dow, left(dow, 3))
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_conditions ? 'order_value_min' THEN
    ov := NULL;
    IF p_ctx ? 'order_value' AND p_ctx->'order_value' IS NOT NULL AND jsonb_typeof(p_ctx->'order_value') != 'null' THEN
      ov := (p_ctx->>'order_value')::numeric;
    END IF;
    IF ov IS NULL OR ov < (p_conditions->>'order_value_min')::numeric THEN
      RETURN false;
    END IF;
  END IF;

  IF p_conditions ? 'rain' THEN
    need_rain := (p_conditions->>'rain')::boolean;
    ctx_rain := coalesce((p_ctx->>'rain')::boolean, false);
    IF need_rain IS TRUE AND ctx_rain IS NOT TRUE THEN
      RETURN false;
    END IF;
    IF need_rain IS FALSE AND ctx_rain IS TRUE THEN
      RETURN false;
    END IF;
  END IF;

  IF p_conditions ? 'traffic_level' AND p_conditions->>'traffic_level' IS NOT NULL THEN
    want_traffic := lower(trim(p_conditions->>'traffic_level'));
    ctx_traffic := lower(trim(coalesce(p_ctx->>'traffic_level', '')));
    IF ctx_traffic = '' OR ctx_traffic <> want_traffic THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- Pick single winning rule: highest priority, then most specific geo (lowest step_ord).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pricing_rules_resolve(
  p_pincode text,
  p_service geo_service,
  p_rule_type pricing_rule_type,
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pid uuid;
  v_id uuid;
  v_level geo_pricing_level;
  v_ref_id uuid;
  v_conditions jsonb;
  v_actions jsonb;
  v_priority int;
  v_override boolean;
  v_step_ord int;
BEGIN
  SELECT p.id INTO v_pid FROM pincodes p WHERE p.pincode = trim(p_pincode) LIMIT 1;
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('found', false, 'error', 'pincode_not_found');
  END IF;

  SELECT pr.id, pr.level, pr.ref_id, pr.conditions, pr.actions, pr.priority, pr.override, gs.step_ord
    INTO v_id, v_level, v_ref_id, v_conditions, v_actions, v_priority, v_override, v_step_ord
  FROM geo_pricing_chain_steps('pincode'::geo_pricing_level, v_pid) gs
  INNER JOIN pricing_rules pr
    ON pr.level = gs.step_level
   AND pr.ref_id = gs.step_id
   AND pr.service_type = p_service
   AND pr.rule_type = p_rule_type
   AND pr.is_active = true
  WHERE pricing_rule_conditions_match(pr.conditions, p_context)
  ORDER BY pr.priority DESC, gs.step_ord ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'pincode_id', v_pid,
      'service', p_service::text,
      'rule_type', p_rule_type::text,
      'message', 'no_matching_rule'
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'pincode_id', v_pid,
    'service', p_service::text,
    'rule_type', p_rule_type::text,
    'rule_id', v_id,
    'level', v_level::text,
    'ref_id', v_ref_id,
    'step_ord', v_step_ord,
    'priority', v_priority,
    'override', v_override,
    'conditions', v_conditions,
    'actions', v_actions
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Totals from actions JSON + context (distance, waiting minutes).
-- Supports: base_fare, per_km, per_km_rate (alias), surge_multiplier, waiting_charge, discount_percent
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pricing_rule_compute_totals(p_actions jsonb, p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  km numeric;
  wm numeric;
  base_n numeric;
  pk numeric;
  surge numeric;
  wc numeric;
  disc_pct numeric;
  subtotal numeric;
  after_disc numeric;
  total numeric;
BEGIN
  km := coalesce((p_context->>'distance_km')::numeric, 0);
  wm := coalesce((p_context->>'waiting_min')::numeric, 0);

  base_n := coalesce(
    nullif((p_actions->>'base_fare')::numeric, null),
    0
  );
  pk := coalesce(
    nullif((p_actions->>'per_km')::numeric, null),
    nullif((p_actions->>'per_km_rate')::numeric, null),
    0
  );
  surge := coalesce(nullif((p_actions->>'surge_multiplier')::numeric, null), 1);
  IF surge = 0 THEN surge := 1; END IF;

  wc := coalesce(nullif((p_actions->>'waiting_charge')::numeric, null), 0);
  disc_pct := coalesce(nullif((p_actions->>'discount_percent')::numeric, null), 0);

  subtotal := base_n + km * pk + wm * wc;
  after_disc := subtotal * (1 - disc_pct / 100.0);
  total := after_disc * surge;

  RETURN jsonb_build_object(
    'subtotal_before_surge', subtotal,
    'after_discount_before_surge', after_disc,
    'total', total,
    'surge_multiplier', surge,
    'distance_km', km,
    'waiting_min', wm
  );
END;
$$;

-- Convenience: resolve + compute totals in one call
CREATE OR REPLACE FUNCTION pricing_rules_resolve_totals(
  p_pincode text,
  p_service geo_service,
  p_rule_type pricing_rule_type,
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base jsonb;
  act jsonb;
  totals jsonb;
BEGIN
  base := pricing_rules_resolve(p_pincode, p_service, p_rule_type, p_context);
  IF coalesce((base->>'found')::boolean, false) IS NOT TRUE THEN
    RETURN base;
  END IF;
  act := base->'actions';
  totals := pricing_rule_compute_totals(act, p_context);
  RETURN base || jsonb_build_object('totals', totals);
END;
$$;
