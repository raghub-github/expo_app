-- 0506: Fix concurrent formatted_order_id generation (unique race on GMC/GMP/GMF).
-- generate_formatted_order_id used MAX()+1 without locking; two parcel places at once
-- both computed the same GMC##### and one insert failed on orders_core unique.

CREATE OR REPLACE FUNCTION public.generate_formatted_order_id(order_type_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
  next_num BIGINT;
  formatted_id TEXT;
  lock_key BIGINT;
BEGIN
  prefix := public.get_order_id_prefix(order_type_val);
  -- Serialize per-prefix so concurrent inserts cannot pick the same next number.
  lock_key := hashtext(prefix)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  IF order_type_val = 'food' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 100000) + 1
    INTO next_num
    FROM public.orders_core
    WHERE formatted_order_id IS NOT NULL
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');

    formatted_id := prefix || LPAD(next_num::TEXT, 6, '0');
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 10000) + 1
    INTO next_num
    FROM public.orders_core
    WHERE formatted_order_id IS NOT NULL
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');

    formatted_id := prefix || LPAD(next_num::TEXT, 5, '0');
  END IF;

  RETURN formatted_id;
END;
$$;

COMMENT ON FUNCTION public.generate_formatted_order_id(TEXT) IS
  'Allocates next GMF/GMC/GMP formatted_order_id with a per-prefix advisory lock to avoid unique races.';

-- Backfill orders_parcel for any parcel orders_core rows missing the 1:1 child
-- (can happen if an older place path committed core without parcel).
INSERT INTO orders_parcel (
  order_id,
  parcel_type,
  vehicle_category,
  vehicle_type_required,
  payment_method,
  pay_at,
  estimated_fare,
  is_cod,
  requires_otp_verification,
  receiver_name,
  receiver_mobile,
  pickup_address,
  pickup_lat,
  pickup_lon,
  drop_address,
  drop_lat,
  drop_lon,
  pickup_otp,
  delivery_otp,
  search_started_at,
  placement_snapshot,
  offer_snapshot
)
SELECT
  oc.id,
  COALESCE((oc.checkout_metadata->>'vehicleCategory'), '2_wheeler'),
  COALESCE((oc.checkout_metadata->>'vehicleCategory'), '2_wheeler'),
  COALESCE((oc.checkout_metadata->>'vehicleTypeRequired'), 'two_wheeler'),
  COALESCE(oc.payment_method::text, 'cash'),
  COALESCE((oc.checkout_metadata->>'payAt'), 'pickup'),
  COALESCE(oc.grand_total, oc.fare_amount, 0),
  COALESCE(oc.payment_method::text, 'cash') = 'cash',
  true,
  oc.delivery_primary_contact_name,
  oc.delivery_primary_contact_phone,
  oc.pickup_address_raw,
  oc.pickup_lat,
  oc.pickup_lon,
  oc.drop_address_raw,
  oc.drop_lat,
  oc.drop_lon,
  oc.pickup_otp,
  oc.delivery_otp,
  oc.placed_at,
  COALESCE(oc.checkout_metadata, '{}'::jsonb),
  '{}'::jsonb
FROM orders_core oc
WHERE oc.order_type = 'parcel'
  AND NOT EXISTS (
    SELECT 1 FROM orders_parcel op WHERE op.order_id = oc.id
  );
