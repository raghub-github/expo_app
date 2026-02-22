-- order_events may exist from older migrations (e.g. 0002) without order_source, event_type, from_status, to_status.
-- trigger_emit_placed_on_core_order() inserts these columns; add them if missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'order_source'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN order_source TEXT NOT NULL DEFAULT 'core_orders';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'PLACED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'from_status'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN from_status TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'to_status'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN to_status TEXT NOT NULL DEFAULT 'PLACED';
  END IF;
END $$;

-- Legacy table has "event" NOT NULL; trigger inserts (order_id, order_source, event_type, ...) but not "event". Set default so trigger succeeds.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'event'
  ) THEN
    ALTER TABLE public.order_events ALTER COLUMN event SET DEFAULT 'PLACED';
  END IF;
END $$;

-- If order_id is BIGINT/integer, trigger inserts TEXT (GM-xxx). Alter to TEXT; drop FK on order_id if present.
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'order_id';
  IF v_data_type IN ('bigint', 'integer') THEN
    ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_order_id_fkey;
    ALTER TABLE public.order_events ALTER COLUMN order_id TYPE TEXT USING order_id::TEXT;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

COMMENT ON TABLE public.order_events IS 'Append-only event log for order state; real-time consumers read from here.';
