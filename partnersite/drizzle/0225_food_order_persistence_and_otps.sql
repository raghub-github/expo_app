-- Complete food order persistence: orders_food denormalized fields + 3×4-digit OTPs on core + food.

-- 1) OTP columns on orders_core and orders_food
ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS pickup_otp text,
  ADD COLUMN IF NOT EXISTS delivery_otp text,
  ADD COLUMN IF NOT EXISTS rto_otp text;

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS pickup_otp text,
  ADD COLUMN IF NOT EXISTS delivery_otp text,
  ADD COLUMN IF NOT EXISTS rto_otp text;

COMMENT ON COLUMN public.orders_core.pickup_otp IS '4-digit pickup OTP; merchant-only.';
COMMENT ON COLUMN public.orders_core.delivery_otp IS '4-digit delivery OTP; customer-only.';
COMMENT ON COLUMN public.orders_core.rto_otp IS '4-digit RTO OTP; shown when order is RTO.';

-- 2) order_food_otps: one row per (order_id, otp_type)
ALTER TABLE public.order_food_otps DROP CONSTRAINT IF EXISTS order_food_otps_order_id_key;

ALTER TABLE public.order_food_otps
  DROP CONSTRAINT IF EXISTS order_food_otps_otp_type_check;

ALTER TABLE public.order_food_otps
  ADD CONSTRAINT order_food_otps_otp_type_check
  CHECK (otp_type IN ('PICKUP', 'DELIVERY', 'RTO'));

CREATE UNIQUE INDEX IF NOT EXISTS order_food_otps_order_id_otp_type_key
  ON public.order_food_otps (order_id, otp_type);

-- 3) Generate unique 4-digit OTP
CREATE OR REPLACE FUNCTION public.generate_four_digit_otp()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_otp text;
BEGIN
  v_otp := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
  RETURN v_otp;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_order_otps(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pickup text;
  v_delivery text;
  v_rto text;
BEGIN
  IF (SELECT pickup_otp FROM public.orders_core WHERE id = p_order_id) IS NOT NULL THEN
    RETURN;
  END IF;

  LOOP
    v_pickup := public.generate_four_digit_otp();
    v_delivery := public.generate_four_digit_otp();
    v_rto := public.generate_four_digit_otp();
    EXIT WHEN v_pickup <> v_delivery AND v_pickup <> v_rto AND v_delivery <> v_rto;
  END LOOP;

  UPDATE public.orders_core
  SET pickup_otp = v_pickup, delivery_otp = v_delivery, rto_otp = v_rto, updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.orders_food
  SET pickup_otp = v_pickup, delivery_otp = v_delivery, rto_otp = v_rto, updated_at = now()
  WHERE order_id = p_order_id OR core_order_id = (SELECT order_id FROM public.orders_core WHERE id = p_order_id LIMIT 1);

  INSERT INTO public.order_food_otps (order_id, otp_code, otp_type)
  VALUES
    (p_order_id, v_pickup, 'PICKUP'),
    (p_order_id, v_delivery, 'DELIVERY'),
    (p_order_id, v_rto, 'RTO')
  ON CONFLICT (order_id, otp_type) DO UPDATE SET
    otp_code = EXCLUDED.otp_code,
    attempt_count = 0,
    locked_until = NULL,
    verified_at = NULL,
    updated_at = now();

  INSERT INTO public.order_food_otp_audit (order_id, action, otp_type)
  VALUES
    (p_order_id, 'GENERATE', 'PICKUP'),
    (p_order_id, 'GENERATE', 'DELIVERY'),
    (p_order_id, 'GENERATE', 'RTO');
END;
$$;

-- 4) Resolve orders_core PK for sync triggers (order_id bigint OR core_order_id text)
CREATE OR REPLACE FUNCTION public.orders_food_resolve_core_pk(p_order_id bigint, p_core_order_id text)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    p_order_id,
    (SELECT id FROM public.orders_core WHERE order_id = p_core_order_id LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION sync_orders_food_customer_rider_details()
RETURNS TRIGGER AS $$
DECLARE
  v_core_pk bigint;
  v_customer_id BIGINT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_customer_email TEXT;
  v_rider_id INTEGER;
  v_rider_name TEXT;
  v_rider_phone TEXT;
  v_store_name TEXT;
  v_store_phone TEXT;
  v_prep_min INTEGER;
BEGIN
  v_core_pk := public.orders_food_resolve_core_pk(NEW.order_id, NEW.core_order_id);
  IF v_core_pk IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.order_id IS NULL THEN
    NEW.order_id := v_core_pk;
  END IF;

  SELECT
    oc.customer_id,
    c.full_name,
    c.primary_mobile,
    c.email,
    oc.rider_id,
    r.name,
    r.mobile,
    COALESCE(ms.store_display_name, ms.store_name),
    COALESCE(ms.store_phones[1], ms.store_phones[2]),
    ms.avg_preparation_time_minutes
  INTO
    v_customer_id,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    v_rider_id,
    v_rider_name,
    v_rider_phone,
    v_store_name,
    v_store_phone,
    v_prep_min
  FROM orders_core oc
  LEFT JOIN customers c ON c.id = oc.customer_id
  LEFT JOIN riders r ON r.id = oc.rider_id
  LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
  WHERE oc.id = v_core_pk;

  NEW.customer_id := COALESCE(NEW.customer_id, v_customer_id);
  NEW.customer_name := COALESCE(NEW.customer_name, v_customer_name);
  NEW.customer_phone := COALESCE(NEW.customer_phone, v_customer_phone);
  NEW.customer_email := COALESCE(NEW.customer_email, v_customer_email);
  NEW.rider_id := COALESCE(NEW.rider_id, v_rider_id);
  NEW.rider_name := COALESCE(NEW.rider_name, v_rider_name);
  NEW.rider_phone := COALESCE(NEW.rider_phone, v_rider_phone);
  NEW.restaurant_name := COALESCE(NEW.restaurant_name, v_store_name);
  NEW.restaurant_phone := COALESCE(NEW.restaurant_phone, v_store_phone);
  NEW.preparation_time_minutes := COALESCE(NEW.preparation_time_minutes, v_prep_min);

  IF NEW.formatted_order_id IS NULL THEN
    SELECT formatted_order_id INTO NEW.formatted_order_id
    FROM orders_core WHERE id = v_core_pk;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_orders_food_items()
RETURNS TRIGGER AS $$
DECLARE
  v_core_pk bigint;
  v_items JSONB;
  v_text_order_id text;
BEGIN
  IF NEW.items IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_core_pk := public.orders_food_resolve_core_pk(NEW.order_id, NEW.core_order_id);
  IF v_core_pk IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT items, order_id INTO v_items, v_text_order_id
  FROM orders_core WHERE id = v_core_pk;

  IF v_items IS NOT NULL THEN
    NEW.items := v_items;
    RETURN NEW;
  END IF;

  IF v_text_order_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_id', menu_item_id,
        'item_name', item_name,
        'quantity', quantity,
        'price', base_price,
        'variant', variant_name,
        'addons', COALESCE((
          SELECT jsonb_agg(addon_name ORDER BY id)
          FROM orders_core_item_addons a
          WHERE a.order_item_id = i.id
        ), '[]'::jsonb),
        'subtotal', total_price,
        'final_amount', total_price,
        'veg_non_veg', veg_nonveg
      ) ORDER BY i.id
    ), '[]'::jsonb)
    INTO v_items
    FROM orders_core_items i
    WHERE i.order_id = v_text_order_id;

    IF v_items IS NOT NULL AND v_items <> '[]'::jsonb THEN
      NEW.items := v_items;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Push food row with order_id = orders_core.id (fixes sync + OTP FK)
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_status TEXT;
  v_item_count INTEGER;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_order_status := COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED');
    IF v_order_status = 'PLACED' THEN
      v_order_status := 'assigned';
    ELSIF v_order_status NOT IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed') THEN
      v_order_status := 'assigned';
    END IF;

    SELECT COALESCE(SUM((elem->>'quantity')::int), 0)::int
    INTO v_item_count
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) elem;

    IF EXISTS (SELECT 1 FROM public.orders_food WHERE core_order_id = NEW.order_id) THEN
      UPDATE public.orders_food SET
        order_id = NEW.id,
        merchant_store_id = NEW.merchant_store_id,
        merchant_parent_id = NEW.merchant_parent_id,
        customer_id = NEW.customer_id,
        food_items_count = COALESCE(NULLIF(v_item_count, 0), food_items_count),
        food_items_total_value = NEW.grand_total,
        items = COALESCE(NEW.items, items),
        delivery_instructions = COALESCE(NEW.checkout_metadata->>'deliveryInstructions', delivery_instructions),
        order_status = v_order_status,
        formatted_order_id = COALESCE(NEW.formatted_order_id, formatted_order_id),
        updated_at = now()
      WHERE core_order_id = NEW.order_id;
    ELSE
      INSERT INTO public.orders_food (
        order_id,
        core_order_id,
        merchant_store_id,
        merchant_parent_id,
        customer_id,
        food_items_count,
        food_items_total_value,
        items,
        delivery_instructions,
        order_status,
        formatted_order_id,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.order_id,
        NEW.merchant_store_id,
        NEW.merchant_parent_id,
        NEW.customer_id,
        NULLIF(v_item_count, 0),
        NEW.grand_total,
        NEW.items,
        COALESCE(NEW.checkout_metadata->>'deliveryInstructions', NULL),
        v_order_status,
        NEW.formatted_order_id,
        now(),
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6) OTP trigger: delegate to generate_unique_order_otps when order_id is known
CREATE OR REPLACE FUNCTION orders_food_otp_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_core_pk bigint;
BEGIN
  v_core_pk := public.orders_food_resolve_core_pk(NEW.order_id, NEW.core_order_id);
  IF v_core_pk IS NOT NULL THEN
    PERFORM public.generate_unique_order_otps(v_core_pk);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop legacy single-source constraint if present (allow both ids after backfill)
ALTER TABLE public.orders_food DROP CONSTRAINT IF EXISTS orders_food_source_check;
