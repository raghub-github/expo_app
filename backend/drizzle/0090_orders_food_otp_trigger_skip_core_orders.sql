-- Fix: orders_food rows from core_orders have order_id NULL (and core_order_id set).
-- The OTP trigger calls generate_food_order_otp(NEW.order_id, 'PICKUP') which inserts into
-- order_food_otps(order_id NOT NULL), so it fails when order_id is null.
-- Only generate OTP for legacy orders_core flow (order_id IS NOT NULL).

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

COMMENT ON FUNCTION orders_food_otp_trigger() IS 'Generate OTP only for legacy orders_core (order_id set). Skip when row is from core_orders (order_id null, core_order_id set).';
