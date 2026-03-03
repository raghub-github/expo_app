-- order_events may have been created by 0002 (event, metadata, actor_type, actor_id)
-- or by 0083 (payload, actor_type, actor_id). Drizzle schema expects payload.
-- Add payload and ensure actor_type, actor_id exist so INSERT from finalizeOrder succeeds.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'payload'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN payload JSONB;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'actor_type'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN actor_type TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN actor_id BIGINT;
  END IF;
END $$;
