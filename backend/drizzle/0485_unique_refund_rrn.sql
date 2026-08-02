-- ─────────────────────────────────────────────────────────────────────────────
-- 0485 · Unique customer-facing refund RRN (RRN-{UUID})
--
-- Aligns order_refunds.refund_reference with the same uniqueness model as
-- GatiCash payment txn ids (GC-{UUID}):
--   • Format: RRN-{UUID} (uppercase)
--   • Never RFND-{id} / WALLET-{ledger} / GCWR-{id}-{ledger}
--   • Razorpay rfnd_* stays on razorpay_refund_id / pg_refund_id (PG Transaction Id)
-- Additive / idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Unique lookup for support / copy-RRN (NULLs allowed for in-flight rows).
CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_refund_reference_uniq
  ON public.order_refunds (refund_reference)
  WHERE refund_reference IS NOT NULL AND TRIM(refund_reference) <> '';

COMMENT ON COLUMN public.order_refunds.refund_reference IS
  'Customer-facing refund RRN. Modern format: RRN-{UUID}. Gateway rfnd_* lives on razorpay_refund_id.';

-- Preserve gateway ids that were mistakenly stored only in refund_reference.
UPDATE public.order_refunds
SET
  razorpay_refund_id = COALESCE(
    NULLIF(TRIM(razorpay_refund_id), ''),
    CASE
      WHEN TRIM(COALESCE(refund_reference, '')) ~* '^rfnd_' THEN TRIM(refund_reference)
      ELSE NULL
    END
  ),
  pg_refund_id = COALESCE(
    NULLIF(TRIM(pg_refund_id), ''),
    CASE
      WHEN TRIM(COALESCE(refund_reference, '')) ~* '^rfnd_' THEN TRIM(refund_reference)
      ELSE NULL
    END
  )
WHERE TRIM(COALESCE(refund_reference, '')) ~* '^rfnd_'
  AND (
    NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NULL
    OR NULLIF(TRIM(COALESCE(pg_refund_id, '')), '') IS NULL
  );

-- Backfill weak / missing refs to globally unique RRN-{UUID}.
DO $$
DECLARE
  r RECORD;
  v_new TEXT;
BEGIN
  FOR r IN
    SELECT id, refund_reference
    FROM public.order_refunds
    WHERE refund_reference IS NULL
       OR TRIM(refund_reference) = ''
       OR TRIM(refund_reference) ~* '^RFND-\d+$'
       OR TRIM(refund_reference) ~* '^WALLET-\d+$'
       OR TRIM(refund_reference) ~* '^GCWR-\d+(-\d+)?$'
       OR TRIM(refund_reference) ~* '^rfnd_'
       OR TRIM(refund_reference) !~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  LOOP
    LOOP
      v_new := 'RRN-' || UPPER(gen_random_uuid()::text);
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.order_refunds x
        WHERE x.refund_reference = v_new
          AND x.id <> r.id
      );
    END LOOP;

    UPDATE public.order_refunds
    SET refund_reference = v_new
    WHERE id = r.id;
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_column THEN
    RAISE NOTICE '0485 unique refund RRN backfill: column missing — %', SQLERRM;
END $$;
