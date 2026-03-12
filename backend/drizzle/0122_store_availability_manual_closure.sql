-- ============================================================================
-- 0122_store_availability_manual_closure
-- Extend merchant store availability + status history and add status logs
-- to support manual open / close flows (portal + merchant app).
-- ============================================================================

-- 1) Extend merchant_store_status_history with approval + operational columns

ALTER TABLE merchant_store_status_history
ADD COLUMN IF NOT EXISTS from_approval_status store_approval_status NULL,
ADD COLUMN IF NOT EXISTS to_approval_status store_approval_status NULL,
ADD COLUMN IF NOT EXISTS from_operational_status store_operational_status NULL,
ADD COLUMN IF NOT EXISTS to_operational_status store_operational_status NULL;

CREATE INDEX IF NOT EXISTS merchant_store_status_history_to_approval_status_idx
  ON merchant_store_status_history(to_approval_status);

CREATE INDEX IF NOT EXISTS merchant_store_status_history_to_operational_status_idx
  ON merchant_store_status_history(to_operational_status);


-- 2) Store status log – one row per manual open / close / lock action

CREATE TABLE IF NOT EXISTS merchant_store_status_log (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  restriction_type TEXT NULL,
  performed_by_id TEXT NULL,
  performed_by_email TEXT NULL,
  performed_by_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  close_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS merchant_store_status_log_store_id_idx
  ON merchant_store_status_log(store_id);

CREATE INDEX IF NOT EXISTS merchant_store_status_log_created_at_idx
  ON merchant_store_status_log(store_id, created_at DESC);


-- 3) Extend merchant_store_availability for manual close / auto open metadata

ALTER TABLE merchant_store_availability
ADD COLUMN IF NOT EXISTS manual_close_until TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS auto_open_from_schedule BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_toggled_by_email TEXT NULL,
ADD COLUMN IF NOT EXISTS last_toggle_type TEXT NULL,
ADD COLUMN IF NOT EXISTS last_toggled_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS block_auto_open BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS restriction_type TEXT NULL,
ADD COLUMN IF NOT EXISTS last_toggled_by_name TEXT NULL,
ADD COLUMN IF NOT EXISTS last_toggled_by_id TEXT NULL;

CREATE INDEX IF NOT EXISTS merchant_store_availability_manual_close_until_idx
  ON merchant_store_availability(store_id)
  WHERE manual_close_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_store_availability_block_auto_open_idx
  ON merchant_store_availability(store_id)
  WHERE block_auto_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_availability_restriction_idx
  ON merchant_store_availability(store_id, restriction_type)
  WHERE restriction_type IS NOT NULL;


-- 4) Optional trigger stub to keep availability in sync with schedule
-- (can be replaced with a full implementation later without changing callers).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'sync_availability_with_schedule'
  ) THEN
    CREATE OR REPLACE FUNCTION sync_availability_with_schedule()
    RETURNS trigger AS $fn$
    BEGIN
      -- Placeholder: real implementation can adjust NEW based on schedule.
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS sync_availability_schedule_trigger ON merchant_store_availability;

CREATE TRIGGER sync_availability_schedule_trigger
  BEFORE INSERT OR UPDATE ON merchant_store_availability
  FOR EACH ROW
  EXECUTE FUNCTION sync_availability_with_schedule();

