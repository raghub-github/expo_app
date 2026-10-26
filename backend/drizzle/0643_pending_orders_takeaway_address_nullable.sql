-- Takeaway / self-pickup orders have no customer delivery address.
-- Delivery orders still require address_id_used in application code.
--
-- I/O-safe:
--   DROP NOT NULL is catalog-only in PostgreSQL (pg_attribute). It does not
--   rewrite pending_orders, scan rows, or rebuild indexes.
--   The nullable check reads information_schema only.
--   lock_timeout 3s: give up instead of queueing an ACCESS EXCLUSIVE lock.
--   statement_timeout 10s: this must finish as a metadata update.

SET lock_timeout = '3s';
SET statement_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.pending_orders') IS NULL THEN
    RAISE EXCEPTION 'pending_orders missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pending_orders'
      AND column_name = 'address_id_used'
  ) THEN
    RAISE EXCEPTION 'pending_orders.address_id_used missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pending_orders'
      AND column_name = 'address_id_used'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.pending_orders
      ALTER COLUMN address_id_used DROP NOT NULL;
  END IF;
END $$;

RESET lock_timeout;
RESET statement_timeout;
