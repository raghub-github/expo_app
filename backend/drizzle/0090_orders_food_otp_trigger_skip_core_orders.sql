-- Fix: orders_food rows from orders_core have core_order_id set (order_id may be null).
-- The OTP trigger calls generate_food_order_otp(NEW.order_id, 'PICKUP') which requires order_id; when order_id is null use core_order_id.
-- Only generate OTP when we have an order identifier (order_id or core_order_id).

CREATE OR REPLACE FUNCTION orders_food_otp_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    PERFORM public.generate_food_order_otp(NEW.order_id, 'PICKUP');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION orders_food_otp_trigger() IS 'Generate OTP for orders_food; uses order_id when set, else core_order_id (orders_core.order_id).';
