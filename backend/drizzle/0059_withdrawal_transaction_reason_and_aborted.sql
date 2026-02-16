-- ============================================================================
-- WITHDRAWAL: Transaction ID, failure/cancel reason, aborted status, payment_method_id
-- ============================================================================
-- Run this in your PostgreSQL/Supabase SQL editor.
-- Ensures: transaction_id, failure_reason, payment_method_id exist; adds 'aborted' to enum.
-- ============================================================================

-- 1. Add payment_method_id if missing (references rider_payment_methods)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'payment_method_id'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD COLUMN payment_method_id INTEGER REFERENCES rider_payment_methods(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS withdrawal_requests_payment_method_id_idx
      ON withdrawal_requests(payment_method_id);
  END IF;
END $$;

-- 2. Ensure transaction_id exists (for success/failed gateway reference)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'transaction_id'
  ) THEN
    ALTER TABLE withdrawal_requests ADD COLUMN transaction_id TEXT;
  END IF;
END $$;

-- 3. Ensure failure_reason exists (for failed/cancelled/aborted reason)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'failure_reason'
  ) THEN
    ALTER TABLE withdrawal_requests ADD COLUMN failure_reason TEXT;
  END IF;
END $$;

-- 4. Ensure account_holder_name exists (for display)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'account_holder_name'
  ) THEN
    ALTER TABLE withdrawal_requests ADD COLUMN account_holder_name TEXT;
  END IF;
END $$;

-- 5. Ensure upi_id exists on withdrawal_requests (for display when no bank)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'upi_id'
  ) THEN
    ALTER TABLE withdrawal_requests ADD COLUMN upi_id TEXT;
  END IF;
END $$;

-- 6. Add 'aborted' to withdrawal_status enum (if not present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'withdrawal_status' AND e.enumlabel = 'aborted'
  ) THEN
    ALTER TYPE withdrawal_status ADD VALUE 'aborted';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- type might not exist in this DB
END $$;

COMMENT ON COLUMN withdrawal_requests.transaction_id IS 'Gateway/bank transaction ID after success or failure';
COMMENT ON COLUMN withdrawal_requests.failure_reason IS 'Reason when status is failed, cancelled, or aborted';
