-- ============================================================================
-- 0135_merchant_store_availability_complete
-- Ensures merchant_store_availability table is complete for all store toggle
-- flows: open/close, closed for today, temp closed, manual open, scheduled off.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1) Ensure table exists (created in 0011); add any missing columns from full DDL
ALTER TABLE merchant_store_availability
  ADD COLUMN IF NOT EXISTS unavailable_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS auto_unavailable_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_available_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS current_pending_orders INTEGER NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_concurrent_orders INTEGER NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS updated_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS manual_close_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_open_from_schedule BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_toggled_by_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_toggle_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_toggled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS block_auto_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restriction_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_toggled_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_toggled_by_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT NULL;

-- Set defaults where columns were added without NOT NULL default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_store_availability'
      AND column_name = 'is_available'
  ) THEN
    ALTER TABLE merchant_store_availability
      ALTER COLUMN is_available SET DEFAULT TRUE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_store_availability'
      AND column_name = 'is_accepting_orders'
  ) THEN
    ALTER TABLE merchant_store_availability
      ALTER COLUMN is_accepting_orders SET DEFAULT TRUE;
  END IF;
END $$;

-- 2) Indexes for toggle / status queries
CREATE INDEX IF NOT EXISTS merchant_store_availability_store_id_idx
  ON public.merchant_store_availability USING btree (store_id);

CREATE INDEX IF NOT EXISTS merchant_store_availability_is_available_idx
  ON public.merchant_store_availability USING btree (is_available)
  WHERE (is_available = TRUE);

CREATE INDEX IF NOT EXISTS merchant_store_availability_is_accepting_orders_idx
  ON public.merchant_store_availability USING btree (is_accepting_orders)
  WHERE (is_accepting_orders = TRUE);

CREATE INDEX IF NOT EXISTS merchant_store_availability_manual_close_until_idx
  ON public.merchant_store_availability USING btree (store_id)
  WHERE (manual_close_until IS NOT NULL);

CREATE INDEX IF NOT EXISTS merchant_store_availability_block_auto_open_idx
  ON public.merchant_store_availability USING btree (store_id)
  WHERE (block_auto_open = TRUE);

CREATE INDEX IF NOT EXISTS merchant_store_availability_restriction_idx
  ON public.merchant_store_availability USING btree (store_id, restriction_type)
  WHERE (restriction_type IS NOT NULL);

-- 3) Trigger function: no-op so app/scheduler own all logic (no double-update)
CREATE OR REPLACE FUNCTION sync_availability_with_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Application and store-schedule-engine own open/close; trigger only passes through.
  RETURN NEW;
END;
$$;

-- 4) Trigger on INSERT/UPDATE
DROP TRIGGER IF EXISTS sync_availability_schedule_trigger ON public.merchant_store_availability;

CREATE TRIGGER sync_availability_schedule_trigger
  BEFORE INSERT OR UPDATE ON public.merchant_store_availability
  FOR EACH ROW
  EXECUTE FUNCTION sync_availability_with_schedule();

-- 5) Ensure unique on store_id (one row per store)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_availability_store_id_key'
      AND conrelid = 'public.merchant_store_availability'::regclass
  ) THEN
    ALTER TABLE public.merchant_store_availability
      ADD CONSTRAINT merchant_store_availability_store_id_key UNIQUE (store_id);
  END IF;
END $$;

COMMENT ON TABLE public.merchant_store_availability IS
  'One row per store: toggle open/close, temp closed, closed for today, manual open, scheduled off. Backend + store-schedule-engine update this table.';
