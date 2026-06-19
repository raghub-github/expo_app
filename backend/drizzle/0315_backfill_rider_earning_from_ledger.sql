-- Backfill orders_core.rider_earning from wallet_ledger delivery + tip credits.
-- Idempotent: only updates rows where rider_earning is null/zero.

UPDATE orders_core oc
SET
  rider_earning = ledger_totals.total,
  updated_at = NOW()
FROM (
  SELECT
    split_part(wl.ref, ':', 3)::bigint AS order_core_id,
    ROUND(SUM(wl.amount::numeric), 2) AS total
  FROM wallet_ledger wl
  WHERE wl.ref ~ '^rider_earn:(delivery|tip):[0-9]+$'
  GROUP BY split_part(wl.ref, ':', 3)
) AS ledger_totals
WHERE oc.id = ledger_totals.order_core_id
  AND (oc.rider_earning IS NULL OR oc.rider_earning::numeric = 0)
  AND ledger_totals.total > 0;
