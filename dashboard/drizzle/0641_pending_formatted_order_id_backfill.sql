-- Backfill pending_orders.checkout_metadata.formatted_order_id so Transactions can
-- show the public order id for GatiCash / Razorpay / mixed checkouts even when
-- orders_core was later deleted. Prefer the live orders_core value; otherwise mint
-- a unique GMF id for orphans.
--
-- I/O-safe:
--   - short lock_timeout + statement_timeout
--   - copy-from-core is a single set-based UPDATE (index-friendly)
--   - orphan minting is row-by-row with tiny batches and RESET between batches
--   - idempotent (skips rows that already have formatted_order_id in metadata)

SET lock_timeout = '2s';
SET statement_timeout = '30s';

-- 1) Copy from live orders_core when the row still exists (GatiCash, Razorpay, mixed).
UPDATE pending_orders po
SET
  checkout_metadata = jsonb_set(
    COALESCE(po.checkout_metadata, '{}'::jsonb),
    '{formatted_order_id}',
    to_jsonb(TRIM(oc.formatted_order_id)),
    true
  ),
  updated_at = NOW()
FROM orders_core oc
WHERE oc.order_id = po.finalized_order_id
  AND NULLIF(TRIM(oc.formatted_order_id), '') IS NOT NULL
  AND (
    po.checkout_metadata->>'formatted_order_id' IS NULL
    OR TRIM(po.checkout_metadata->>'formatted_order_id') = ''
  );

RESET lock_timeout;
RESET statement_timeout;

-- 2) Orphans (payment captured, orders_core missing): mint unique GMF ids in small batches.
DO $$
DECLARE
  r RECORD;
  next_num BIGINT;
  new_fmt TEXT;
  batch_count INT := 0;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '20s';

  SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 100000)
  INTO next_num
  FROM orders_core
  WHERE formatted_order_id ~ '^GMF[0-9]+$';

  SELECT GREATEST(
    next_num,
    COALESCE((
      SELECT MAX(CAST(SUBSTRING(po.checkout_metadata->>'formatted_order_id' FROM 4) AS BIGINT))
      FROM pending_orders po
      WHERE po.checkout_metadata->>'formatted_order_id' ~ '^GMF[0-9]+$'
    ), 100000)
  )
  INTO next_num;

  FOR r IN
    SELECT po.id, po.checkout_metadata
    FROM pending_orders po
    WHERE po.finalized_order_id IS NOT NULL
      AND TRIM(po.finalized_order_id) <> ''
      AND po.payment_state IN ('finalized', 'paid', 'refunded', 'refund_pending')
      AND (
        po.checkout_metadata->>'formatted_order_id' IS NULL
        OR TRIM(po.checkout_metadata->>'formatted_order_id') = ''
      )
      AND NOT EXISTS (
        SELECT 1 FROM orders_core oc WHERE oc.order_id = po.finalized_order_id
      )
    ORDER BY po.id
  LOOP
    next_num := next_num + 1;
    new_fmt := 'GMF' || LPAD(next_num::TEXT, 6, '0');

    UPDATE pending_orders
    SET
      checkout_metadata = jsonb_set(
        COALESCE(r.checkout_metadata, '{}'::jsonb),
        '{formatted_order_id}',
        to_jsonb(new_fmt),
        true
      ),
      updated_at = NOW()
    WHERE id = r.id;

    batch_count := batch_count + 1;
    -- Yield between small batches so other sessions are not starved.
    IF batch_count % 25 = 0 THEN
      PERFORM pg_sleep(0.05);
    END IF;
  END LOOP;
END $$;
