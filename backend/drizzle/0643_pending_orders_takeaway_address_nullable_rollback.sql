-- Rollback is NOT I/O-safe: SET NOT NULL scans every pending_orders row.
-- Refuses to start when any takeaway row already has a null address_id_used,
-- so the scan is not attempted on data that cannot satisfy the constraint.

SET lock_timeout = '3s';
SET statement_timeout = '15s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pending_orders
    WHERE address_id_used IS NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'pending_orders has null address_id_used; cannot restore NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pending_orders'
      AND column_name = 'address_id_used'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.pending_orders
      ALTER COLUMN address_id_used SET NOT NULL;
  END IF;
END $$;

RESET lock_timeout;
RESET statement_timeout;
