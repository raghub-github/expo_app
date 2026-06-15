-- Food order pickup verification token (barcode/QR) + audit trail.
-- Pickup is NOT complete until barcode OR OTP verification succeeds.

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS pickup_verification_token TEXT;

COMMENT ON COLUMN public.orders_food.pickup_verification_token IS
  'Token encoded on restaurant bill barcode/QR; rider scans to verify pickup.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_food_pickup_verification_token_uidx
  ON public.orders_food (pickup_verification_token)
  WHERE pickup_verification_token IS NOT NULL;

-- Backfill tokens for existing food orders
UPDATE public.orders_food of
SET pickup_verification_token = 'PV-' || upper(
  COALESCE(
    NULLIF(btrim(of.formatted_order_id), ''),
    NULLIF(btrim(of.core_order_id), ''),
    'ORD' || of.order_id::text
  )
) || '-' || substr(md5(of.order_id::text || ':' || COALESCE(of.core_order_id, '')), 1, 10)
WHERE pickup_verification_token IS NULL
  AND of.order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.food_order_pickup_verifications (
  id BIGSERIAL PRIMARY KEY,
  order_core_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id_text TEXT NOT NULL,
  rider_id INTEGER NOT NULL,
  verification_method TEXT NOT NULL CHECK (verification_method IN ('barcode', 'otp')),
  verification_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_timestamp TIMESTAMPTZ,
  barcode_value TEXT,
  otp_verified BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS food_order_pickup_verifications_order_idx
  ON public.food_order_pickup_verifications (order_core_id, verification_time DESC);

CREATE INDEX IF NOT EXISTS food_order_pickup_verifications_rider_idx
  ON public.food_order_pickup_verifications (rider_id, verification_time DESC);

COMMENT ON TABLE public.food_order_pickup_verifications IS
  'Audit log: rider pickup verification via barcode or OTP before order leaves ready_for_pickup.';

-- Ensure OTP generation also creates pickup verification token
CREATE OR REPLACE FUNCTION public.generate_unique_order_otps(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pickup text;
  v_delivery text;
  v_rto text;
  v_token text;
  v_formatted text;
  v_core_text text;
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

  SELECT order_id, formatted_order_id
  INTO v_core_text, v_formatted
  FROM public.orders_core
  WHERE id = p_order_id;

  v_token := 'PV-' || upper(
    COALESCE(NULLIF(btrim(v_formatted), ''), NULLIF(btrim(v_core_text), ''), 'ORD' || p_order_id::text)
  ) || '-' || substr(md5(p_order_id::text || ':' || COALESCE(v_core_text, '')), 1, 10);

  UPDATE public.orders_core
  SET pickup_otp = v_pickup, delivery_otp = v_delivery, rto_otp = v_rto, updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.orders_food
  SET
    pickup_otp = v_pickup,
    delivery_otp = v_delivery,
    rto_otp = v_rto,
    pickup_verification_token = COALESCE(pickup_verification_token, v_token),
    updated_at = now()
  WHERE order_id = p_order_id
     OR core_order_id = v_core_text;

  INSERT INTO public.order_food_otps (order_id, otp_code, otp_type)
  VALUES
    (p_order_id, v_pickup, 'PICKUP'),
    (p_order_id, v_delivery, 'DELIVERY'),
    (p_order_id, v_rto, 'RTO')
  ON CONFLICT (order_id, otp_type) DO UPDATE SET
    otp_code = EXCLUDED.otp_code,
    attempt_count = 0,
    updated_at = now();
END;
$$;
