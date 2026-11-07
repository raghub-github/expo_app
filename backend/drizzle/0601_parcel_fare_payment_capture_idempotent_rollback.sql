-- Rollback 0601 — drop only the partial unique index we may have created.
-- Do not drop orders_core_payments_transaction_id_key from 0008.

DROP INDEX IF EXISTS public.orders_core_payments_transaction_id_uq;
