-- Rollback 0484 · Unique GatiCash payment transaction IDs

DROP INDEX IF EXISTS public.order_refunds_original_gati_cash_txn_id_idx;
DROP INDEX IF EXISTS public.orders_core_payments_gati_txn_idx;
DROP INDEX IF EXISTS public.orders_core_payments_transaction_id_uniq;

ALTER TABLE public.order_refunds
  DROP COLUMN IF EXISTS original_gati_cash_txn_id;

-- Note: backfilled GC-{UUID} values on orders_core_payments / customer_wallet_transactions
-- are intentionally NOT reverted (would reintroduce collisions / break audit trails).
-- Restore from backup if a full rollback of txn ids is required.
