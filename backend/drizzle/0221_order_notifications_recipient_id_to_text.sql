-- 0221: Same schema drift as 0220 but for order_notifications.recipient_id.
--
-- WHY:
--   The Drizzle schema declares `recipient_id` as TEXT (some recipients are
--   composite keys like 'store:45' for rider_pool dispatch fan-out). The
--   deployed DB has it as BIGINT, so inserts of non-numeric recipient IDs
--   fail with:
--     "invalid input syntax for type bigint: \"store:45\""
--   This was masked under 0220's order_id error until that was fixed.
--
-- WHAT:
--   Drop any FK on recipient_id (none expected — it's a heterogeneous key,
--   not an FK to a single table). Convert to TEXT. No data loss.

BEGIN;

DO $$
DECLARE
  v_type text;
  v_fk_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_notifications'
  ) THEN
    RAISE NOTICE 'order_notifications table does not exist; skipping';
    RETURN;
  END IF;

  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'order_notifications'
    AND column_name  = 'recipient_id';

  IF v_type = 'text' THEN
    RAISE NOTICE 'order_notifications.recipient_id is already TEXT; skipping';
    RETURN;
  END IF;

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
      AND att.attname = 'recipient_id'
  LOOP
    EXECUTE format('ALTER TABLE public.order_notifications DROP CONSTRAINT %I', v_fk_name);
    RAISE NOTICE 'Dropped FK constraint % on order_notifications.recipient_id', v_fk_name;
  END LOOP;

  EXECUTE 'ALTER TABLE public.order_notifications ALTER COLUMN recipient_id TYPE TEXT USING (recipient_id::text)';
  RAISE NOTICE 'order_notifications.recipient_id converted from % to TEXT', v_type;
END $$;

COMMIT;
