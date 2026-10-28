-- Rollback for 0643_parcel_ride_uncaptured_cancel_payment_failed
-- Restores cancelled parcel/person_ride payment_status failed → pending
-- ONLY when there is still no captured payment row (same guard as forward).
-- Does not invent prior ocp statuses (INITIATED rows stay FAILED if already written).

SET lock_timeout = '2s';
SET statement_timeout = '30s';

DO $$
DECLARE
  batch_size INT := 500;
  last_id BIGINT := 0;
  max_id BIGINT;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO max_id
  FROM orders_core
  WHERE order_type IN ('parcel', 'person_ride');

  WHILE last_id < max_id LOOP
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '20s';

    UPDATE orders_core oc
    SET
      payment_status = 'pending',
      updated_at = NOW()
    WHERE oc.id > last_id
      AND oc.id <= last_id + batch_size
      AND oc.order_type IN ('parcel', 'person_ride')
      AND (
        lower(COALESCE(oc.status::text, '')) IN ('cancelled', 'canceled')
        OR upper(replace(COALESCE(oc.current_status, ''), ' ', '_')) IN ('CANCELLED', 'CANCELED')
      )
      AND lower(COALESCE(oc.payment_status::text, '')) = 'failed'
      AND NOT EXISTS (
        SELECT 1
        FROM orders_core_payments ocp
        WHERE (
            oc.order_id = ocp.order_id
            OR oc.formatted_order_id = ocp.order_id
            OR oc.id::text = ocp.order_id
            OR (
              ocp.order_id ~ '^[0-9]+$'
              AND oc.id = ocp.order_id::bigint
            )
          )
          AND upper(COALESCE(ocp.payment_status, '')) IN (
            'PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED'
          )
      );

    last_id := last_id + batch_size;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

RESET lock_timeout;
RESET statement_timeout;
