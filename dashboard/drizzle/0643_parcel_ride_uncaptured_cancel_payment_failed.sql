-- 0643_parcel_ride_uncaptured_cancel_payment_failed
-- Purpose:
--   Cancelled parcel / person_ride orders that never captured payment must show
--   as Failed in admin Transactions (not Pending).
-- Scope:
--   - orders_core.payment_status: pending|processing → failed when cancelled
--   - matching open orders_core_payments rows: INITIATED|PENDING → FAILED
-- I/O-safe:
--   - short lock_timeout + statement_timeout
--   - batched UPDATEs by id range (no long table lock)
--   - idempotent WHERE guards (skips already-failed / paid / refunded)
-- No DDL / enum changes (payment_status_type already includes failed).

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

    WITH chunk AS (
      SELECT oc.id
      FROM orders_core oc
      WHERE oc.id > last_id
        AND oc.id <= last_id + batch_size
        AND oc.order_type IN ('parcel', 'person_ride')
        AND (
          lower(COALESCE(oc.status::text, '')) IN ('cancelled', 'canceled')
          OR upper(replace(COALESCE(oc.current_status, ''), ' ', '_')) IN ('CANCELLED', 'CANCELED')
        )
        AND lower(COALESCE(oc.payment_status::text, 'pending')) IN (
          'pending', 'processing', 'cancelled'
        )
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
        )
    )
    UPDATE orders_core oc
    SET
      payment_status = 'failed',
      updated_at = NOW()
    FROM chunk
    WHERE oc.id = chunk.id;

    -- Close open payment-attempt rows for the same chunk (never overwrite PAID).
    UPDATE orders_core_payments ocp
    SET
      payment_status = 'FAILED',
      updated_at = NOW()
    WHERE upper(COALESCE(ocp.payment_status, '')) IN ('INITIATED', 'PENDING', 'PROCESSING')
      AND EXISTS (
        SELECT 1
        FROM orders_core oc
        WHERE oc.id > last_id
          AND oc.id <= last_id + batch_size
          AND oc.order_type IN ('parcel', 'person_ride')
          AND (
            lower(COALESCE(oc.status::text, '')) IN ('cancelled', 'canceled')
            OR upper(replace(COALESCE(oc.current_status, ''), ' ', '_')) IN ('CANCELLED', 'CANCELED')
          )
          AND (
            oc.order_id = ocp.order_id
            OR oc.formatted_order_id = ocp.order_id
            OR oc.id::text = ocp.order_id
            OR (
              ocp.order_id ~ '^[0-9]+$'
              AND oc.id = ocp.order_id::bigint
            )
          )
      );

    last_id := last_id + batch_size;

    -- Yield between batches so writers are not starved.
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

RESET lock_timeout;
RESET statement_timeout;
