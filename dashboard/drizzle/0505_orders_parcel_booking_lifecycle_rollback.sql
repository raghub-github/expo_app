-- Rollback 0505: drop added orders_parcel booking/lifecycle columns.
-- Does not drop orders_core columns (shared by food/ride).

DROP INDEX IF EXISTS orders_parcel_platform_offer_idx;
DROP INDEX IF EXISTS orders_parcel_assigned_rider_idx;
DROP INDEX IF EXISTS orders_parcel_search_expires_idx;
DROP INDEX IF EXISTS orders_parcel_pay_at_idx;
DROP INDEX IF EXISTS orders_parcel_payment_method_idx;
DROP INDEX IF EXISTS orders_parcel_vehicle_category_idx;

ALTER TABLE orders_parcel DROP CONSTRAINT IF EXISTS orders_parcel_vehicle_category_chk;
ALTER TABLE orders_parcel DROP CONSTRAINT IF EXISTS orders_parcel_payment_method_chk;
ALTER TABLE orders_parcel DROP CONSTRAINT IF EXISTS orders_parcel_pay_at_chk;

ALTER TABLE orders_parcel
  DROP COLUMN IF EXISTS placement_snapshot,
  DROP COLUMN IF EXISTS accept_payout_snapshot,
  DROP COLUMN IF EXISTS cash_collected_by_rider_id,
  DROP COLUMN IF EXISTS cash_collected_at,
  DROP COLUMN IF EXISTS cancellation_reason_text,
  DROP COLUMN IF EXISTS cancellation_reason_code,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancelled_by_type,
  DROP COLUMN IF EXISTS delivery_otp_verified_at,
  DROP COLUMN IF EXISTS pickup_otp_verified_at,
  DROP COLUMN IF EXISTS rider_reached_pickup_at,
  DROP COLUMN IF EXISTS rider_assigned_at,
  DROP COLUMN IF EXISTS assigned_rider_id,
  DROP COLUMN IF EXISTS search_timeout_sec,
  DROP COLUMN IF EXISTS search_expires_at,
  DROP COLUMN IF EXISTS search_started_at,
  DROP COLUMN IF EXISTS delivery_otp,
  DROP COLUMN IF EXISTS pickup_otp,
  DROP COLUMN IF EXISTS applied_offer_discount,
  DROP COLUMN IF EXISTS offer_snapshot,
  DROP COLUMN IF EXISTS platform_offer_id,
  DROP COLUMN IF EXISTS coupon_code,
  DROP COLUMN IF EXISTS amount_collected,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS trip_distance_km,
  DROP COLUMN IF EXISTS final_fare,
  DROP COLUMN IF EXISTS estimated_fare,
  DROP COLUMN IF EXISTS pay_at,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS vehicle_type_required,
  DROP COLUMN IF EXISTS vehicle_category,
  DROP COLUMN IF EXISTS drop_lon,
  DROP COLUMN IF EXISTS drop_lat,
  DROP COLUMN IF EXISTS drop_address,
  DROP COLUMN IF EXISTS drop_label,
  DROP COLUMN IF EXISTS pickup_lon,
  DROP COLUMN IF EXISTS pickup_lat,
  DROP COLUMN IF EXISTS pickup_address,
  DROP COLUMN IF EXISTS pickup_label,
  DROP COLUMN IF EXISTS sender_mobile,
  DROP COLUMN IF EXISTS sender_name,
  DROP COLUMN IF EXISTS receiver_mobile,
  DROP COLUMN IF EXISTS receiver_name;
