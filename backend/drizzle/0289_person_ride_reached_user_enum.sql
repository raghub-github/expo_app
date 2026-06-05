-- Step 1/2: add reached_user to order_status_type (orders_core.status).
-- Run 0290_person_ride_reached_user_data.sql immediately after (separate transaction).

DO $$ BEGIN
  ALTER TYPE public.order_status_type ADD VALUE 'reached_user';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.order_status_type IS
  'Coarse order lifecycle on orders_core. Person ride: reached_user only after pickup OTP; food uses reached_store.';
