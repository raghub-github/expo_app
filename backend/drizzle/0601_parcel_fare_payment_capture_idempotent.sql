-- 0601 · Parcel fare payment capture idempotency (I/O safe retries)
--
-- Customer parcel fare confirm uses a stable transaction_id:
--   razorpay payment id | GC-{UUID} | parcel_fare:<orders_core.id>
-- Retries / double-taps must not insert a second capture row.
--
-- orders_core_payments.transaction_id was UNIQUE in 0008; enforce again if
-- an environment lost the constraint, after collapsing any exact duplicates.

-- Collapse exact duplicate transaction_ids (keep newest paid_at / id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY transaction_id
      ORDER BY paid_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.orders_core_payments
  WHERE transaction_id IS NOT NULL
    AND BTRIM(transaction_id) <> ''
)
DELETE FROM public.orders_core_payments p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders_core_payments'::regclass
      AND contype = 'u'
      AND conname = 'orders_core_payments_transaction_id_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'orders_core_payments_transaction_id_uq'
  ) THEN
    BEGIN
      ALTER TABLE public.orders_core_payments
        ADD CONSTRAINT orders_core_payments_transaction_id_key UNIQUE (transaction_id);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
      WHEN unique_violation THEN
        -- Leftover duplicates: unique index only on non-empty ids via partial index.
        CREATE UNIQUE INDEX IF NOT EXISTS orders_core_payments_transaction_id_uq
          ON public.orders_core_payments (transaction_id)
          WHERE transaction_id IS NOT NULL AND BTRIM(transaction_id) <> '';
    END;
  END IF;
END $$;

COMMENT ON COLUMN public.orders_core_payments.transaction_id IS
  'Idempotent payment capture key (Razorpay pay_*, GC-{UUID}, or parcel_fare:<coreId> / ride_fare:*).';
