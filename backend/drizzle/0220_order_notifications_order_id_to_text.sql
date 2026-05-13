-- 0220: Fix order_notifications.order_id column type drift.
--
-- WHY:
--   The Drizzle schema (src/db/schema.ts) declares `order_id` as TEXT (matches
--   orders_core.order_id which stores GM-prefixed strings like 'GM10000021').
--   The deployed database has the column as BIGINT, with an FK pointing at
--   the now-legacy orders_core.id (bigserial PK).
--
--   Inserts from finalizeOrder() fail with:
--     "invalid input syntax for type bigint: \"GM10000021\""
--   which aborts the entire finalize-order transaction and prevents the order
--   from being placed.
--
-- WHAT:
--   1. Drop the legacy FK to orders_core.id (different column type).
--   2. Convert order_id to TEXT (casting any existing bigint values).
--   3. Leave the FK off intentionally — the outbox is a best-effort log; an FK
--      back to orders_core would also require choosing TEXT vs BIGINT side and
--      could block fast inserts. The order_id index is still in place for
--      lookups by the consumer worker.

BEGIN;

DO $$
DECLARE
  v_type text;
  v_fk_name text;
BEGIN
  -- Bail early if the table doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_notifications'
  ) THEN
    RAISE NOTICE 'order_notifications table does not exist; skipping';
    RETURN;
  END IF;

  -- Check current column type
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'order_notifications'
    AND column_name  = 'order_id';

  IF v_type = 'text' THEN
    RAISE NOTICE 'order_notifications.order_id is already TEXT; skipping';
    RETURN;
  END IF;

  -- Drop any FK on order_notifications.order_id (name varies by migration history)
  FOR v_fk_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class       rel ON rel.oid = con.conrelid
    JOIN pg_namespace   nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute   att ON att.attrelid = rel.oid
                            AND att.attnum  = ANY(con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'order_notifications'
      AND con.contype = 'f'
      AND att.attname = 'order_id'
  LOOP
    EXECUTE format('ALTER TABLE public.order_notifications DROP CONSTRAINT %I', v_fk_name);
    RAISE NOTICE 'Dropped FK constraint % on order_notifications.order_id', v_fk_name;
  END LOOP;

  -- Drop the legacy index too so the type change is unblocked, we'll rebuild after
  DROP INDEX IF EXISTS public.order_notifications_order_id_idx;

  -- Convert bigint → text (rows preserved)
  EXECUTE 'ALTER TABLE public.order_notifications ALTER COLUMN order_id TYPE TEXT USING (order_id::text)';

  -- Rebuild the lookup index on the new text column
  CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx
    ON public.order_notifications (order_id);

  RAISE NOTICE 'order_notifications.order_id converted from % to TEXT', v_type;
END $$;

COMMIT;
