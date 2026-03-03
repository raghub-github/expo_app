-- orders_core as single source of truth; drop core_orders.
-- 1) Sequence for order_id (GM10000001, GM10000002, ...)
-- 2) Add columns to orders_core for placement flow
-- 3) Migrate core_orders data into orders_core
-- 4) Rename core_order_items → orders_core_items, core_order_item_addons → orders_core_item_addons, core_payments → orders_core_payments
-- 5) Relink FKs to orders_core.order_id
-- 6) Triggers on orders_core; drop core_orders

CREATE SEQUENCE IF NOT EXISTS public.order_id_seq START WITH 10000001;

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS order_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS item_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addon_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS placed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'PLACED';

CREATE UNIQUE INDEX IF NOT EXISTS orders_core_order_id_key ON public.orders_core(order_id) WHERE order_id IS NOT NULL;

-- Migrate existing core_orders into orders_core (only if core_orders exists and has rows)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_orders') THEN
    INSERT INTO public.orders_core (
      order_id,
      order_type,
      order_source,
      customer_id,
      merchant_store_id,
      merchant_parent_id,
      status,
      current_status,
      pickup_address_raw,
      pickup_lat,
      pickup_lon,
      drop_address_raw,
      drop_lat,
      drop_lon,
      item_total,
      addon_total,
      grand_total,
      tip_amount,
      placed_at,
      delivery_address,
      payment_status,
      payment_method,
      created_at,
      updated_at
    )
    SELECT
      co.order_id,
      (CASE WHEN UPPER(TRIM(COALESCE(co.order_type, 'FOOD'))) = 'FOOD' THEN 'food'::order_type ELSE 'food'::order_type END),
      'internal'::order_source_type,
      co.customer_id,
      co.merchant_store_id,
      co.merchant_parent_id,
      'assigned'::order_status_type,
      COALESCE(co.current_status, 'PLACED'),
      COALESCE(TRIM(co.pickup_address_normalized), ''),
      COALESCE(co.pickup_lat::NUMERIC, 0),
      COALESCE(co.pickup_lon::NUMERIC, 0),
      COALESCE(TRIM(co.drop_address_normalized), COALESCE(TRIM(co.delivery_address), '')),
      COALESCE(co.drop_lat::NUMERIC, 0),
      COALESCE(co.drop_lon::NUMERIC, 0),
      COALESCE(co.item_total, 0),
      COALESCE(co.addon_total, 0),
      co.grand_total,
      COALESCE(co.tip_amount, 0),
      COALESCE(co.placed_at, co.created_at),
      co.delivery_address,
      (CASE WHEN UPPER(TRIM(COALESCE(co.payment_status, ''))) IN ('PAID', 'COMPLETED') THEN 'completed'::payment_status_type ELSE 'pending'::payment_status_type END),
      (CASE WHEN LOWER(TRIM(COALESCE(co.payment_method, 'online'))) IN ('cash','online','wallet','upi','card','netbanking','cod','other') THEN LOWER(TRIM(co.payment_method))::payment_mode_type ELSE 'online'::payment_mode_type END),
      COALESCE(co.created_at, now()),
      COALESCE(co.updated_at, now())
    FROM public.core_orders co
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
END $$;

-- Rename tables
ALTER TABLE IF EXISTS public.core_order_items RENAME TO orders_core_items;
ALTER TABLE IF EXISTS public.core_order_item_addons RENAME TO orders_core_item_addons;
ALTER TABLE IF EXISTS public.core_payments RENAME TO orders_core_payments;

-- Drop old FKs and add new ones pointing to orders_core.order_id (idempotent: drop both possible names)
ALTER TABLE public.orders_core_items
  DROP CONSTRAINT IF EXISTS core_order_items_order_id_fkey,
  DROP CONSTRAINT IF EXISTS orders_core_items_order_id_fkey;

ALTER TABLE public.orders_core_items
  ADD CONSTRAINT orders_core_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders_core(order_id) ON DELETE CASCADE;

ALTER TABLE public.orders_core_item_addons
  DROP CONSTRAINT IF EXISTS core_order_item_addons_order_item_id_fkey,
  DROP CONSTRAINT IF EXISTS orders_core_item_addons_order_item_id_fkey;

ALTER TABLE public.orders_core_item_addons
  ADD CONSTRAINT orders_core_item_addons_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.orders_core_items(id) ON DELETE CASCADE;

ALTER TABLE public.orders_core_payments
  DROP CONSTRAINT IF EXISTS core_payments_order_id_fkey,
  DROP CONSTRAINT IF EXISTS orders_core_payments_order_id_fkey;

ALTER TABLE public.orders_core_payments
  ADD CONSTRAINT orders_core_payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders_core(order_id) ON DELETE SET NULL;

-- Indexes (rename if needed; names may already exist)
CREATE INDEX IF NOT EXISTS orders_core_items_order_id_idx ON public.orders_core_items(order_id);
CREATE INDEX IF NOT EXISTS orders_core_item_addons_order_item_id_idx ON public.orders_core_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS orders_core_payments_order_id_idx ON public.orders_core_payments(order_id);

-- Drop triggers on core_orders only if table exists (idempotent when core_orders already dropped)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_orders') THEN
    DROP TRIGGER IF EXISTS after_core_order_insert ON public.core_orders;
    DROP TRIGGER IF EXISTS after_core_order_insert_emit_placed ON public.core_orders;
  END IF;
END $$;

-- Push to orders_food when inserting into orders_core with order_id and order_type = food (enum).
-- order_status must be one of: assigned, accepted, reached_store, picked_up, in_transit, delivered, cancelled, failed (CHECK constraint).
-- Map PLACED -> assigned.
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_status TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_order_status := COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED');
    IF v_order_status = 'PLACED' THEN
      v_order_status := 'assigned';
    ELSIF v_order_status NOT IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed') THEN
      v_order_status := 'assigned';
    END IF;
    INSERT INTO public.orders_food (
      core_order_id,
      merchant_store_id,
      merchant_parent_id,
      customer_id,
      food_items_total_value,
      order_status,
      created_at,
      updated_at
    )
    VALUES (
      NEW.order_id,
      NEW.merchant_store_id,
      NEW.merchant_parent_id,
      NEW.customer_id,
      NEW.grand_total,
      v_order_status,
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_orders_core_insert_push_food
  AFTER INSERT ON public.orders_core
  FOR EACH ROW
  EXECUTE FUNCTION push_food_order_from_orders_core();

-- Emit PLACED event when orders_core row with order_id is inserted
CREATE OR REPLACE FUNCTION trigger_emit_placed_on_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    INSERT INTO public.order_events (order_id, order_source, event_type, from_status, to_status)
    VALUES (NEW.order_id, 'orders_core', 'PLACED', NULL, COALESCE(NEW.current_status, 'PLACED'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_orders_core_insert_emit_placed
  AFTER INSERT ON public.orders_core
  FOR EACH ROW
  EXECUTE FUNCTION trigger_emit_placed_on_orders_core();

-- Update emit_order_event to use orders_core by order_id (no more core_orders)
CREATE OR REPLACE FUNCTION emit_order_event(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'orders_core',
  p_event_type order_event_type DEFAULT NULL,
  p_to_status TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_actor_type TEXT DEFAULT NULL,
  p_actor_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evt_type order_event_type;
  v_to_status TEXT;
  v_from_status TEXT;
  v_event_id BIGINT;
BEGIN
  v_evt_type := COALESCE(p_event_type, p_to_status::order_event_type);
  v_to_status := COALESCE(p_to_status, p_evt_type::TEXT);

  SELECT current_status INTO v_from_status FROM public.orders_core
  WHERE order_id = p_order_id OR id::TEXT = p_order_id
  LIMIT 1;

  INSERT INTO public.order_events (order_id, order_source, event_type, from_status, to_status, payload, actor_type, actor_id)
  VALUES (p_order_id, p_order_source, v_evt_type, v_from_status, v_to_status, p_payload, p_actor_type, p_actor_id)
  RETURNING id INTO v_event_id;

  UPDATE public.orders_core SET current_status = v_to_status, updated_at = now() WHERE order_id = p_order_id;
  UPDATE public.orders_food SET order_status = v_to_status, updated_at = now() WHERE core_order_id = p_order_id;

  RETURN v_event_id;
END;
$$;

-- Default order_source to orders_core for new events
ALTER TABLE public.order_events ALTER COLUMN order_source SET DEFAULT 'orders_core';

-- recalc_order_eta: only orders_core (order_id or id)
CREATE OR REPLACE FUNCTION recalc_order_eta(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'orders_core',
  p_trigger_event TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance_km NUMERIC(8,2);
  v_eta_seconds INTEGER;
  v_status TEXT;
BEGIN
  SELECT distance_km, current_status INTO v_distance_km, v_status
  FROM public.orders_core
  WHERE order_id = p_order_id OR id::TEXT = p_order_id
  LIMIT 1;

  v_distance_km := COALESCE(v_distance_km, 5);
  v_eta_seconds := 600;

  IF v_status IN ('PREPARING', 'ORDER_RECEIVED', 'ACCEPTED', 'PLACED') THEN
    v_eta_seconds := 900 + (v_distance_km * 180)::INTEGER;
  ELSIF v_status = 'READY_FOR_PICKUP' THEN
    v_eta_seconds := 600 + (v_distance_km * 120)::INTEGER;
  ELSIF v_status IN ('OUT_FOR_DELIVERY', 'in_transit') THEN
    v_eta_seconds := (v_distance_km * 120)::INTEGER;
  END IF;

  INSERT INTO public.order_eta_snapshots (order_id, order_source, eta_seconds, trigger_event, distance_km)
  VALUES (p_order_id, p_order_source, v_eta_seconds, p_trigger_event, v_distance_km);

  RETURN v_eta_seconds;
END;
$$;

-- Drop core_orders (CASCADE drops any remaining refs)
DROP TABLE IF EXISTS public.core_orders CASCADE;

COMMENT ON COLUMN public.orders_core.order_id IS 'Canonical order id e.g. GM10000001; from order_id_seq.';
COMMENT ON TABLE public.orders_core_items IS 'Line items per order; references orders_core.order_id.';
COMMENT ON TABLE public.orders_core_item_addons IS 'Addons per line item; references orders_core_items.id.';
COMMENT ON TABLE public.orders_core_payments IS 'Payment record per order; references orders_core.order_id.';
