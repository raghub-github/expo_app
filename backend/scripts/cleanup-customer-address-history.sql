-- ============================================================================
-- Manual cleanup: collapse customer_address_history MRU/no-op churn.
-- ============================================================================
-- RUN DELIBERATELY, NOT AS AN AUTO-MIGRATION. Take a DB snapshot / rely on
-- Supabase PITR first; this script also writes its own backup table.
--
-- Context: the old address-history trigger logged a full snapshot on EVERY
-- customer_addresses update (including MRU heartbeats and no-ops), so the table
-- filled with rows that differ ONLY in bookkeeping columns
-- (updated_at / last_used_at / is_last_used / order_count). Migration 0563 stops
-- new churn; this script removes the historical churn already accumulated.
--
-- What it KEEPS (never deleted):
--   * every INSERT row and every non-UPDATE change_type (e.g. LOCATION_SELECTED)
--   * the newest history row per address (current-state snapshot)
--   * every UPDATE whose SUBSTANTIVE snapshot differs from the previous row
--     (i.e. a real edit to label / address / coords / contact / is_default / …)
-- What it DELETES:
--   * UPDATE rows that are substantively identical to their predecessor and are
--     not the newest row for that address (pure MRU / no-op churn).
--
-- Touches ONLY customer_address_history. customer_addresses rows and per-order
-- address snapshots (orders_core.*) are never modified. No FKs reference this
-- table, so deletion is safe.
-- ============================================================================

BEGIN;

-- 1. Backup (idempotent: skips if a backup already exists).
DO $$
BEGIN
  IF to_regclass('public.customer_address_history_backup') IS NULL THEN
    EXECUTE 'CREATE TABLE public.customer_address_history_backup AS
             SELECT * FROM public.customer_address_history';
    RAISE NOTICE 'Backup created: customer_address_history_backup (% rows)',
      (SELECT count(*) FROM public.customer_address_history_backup);
  ELSE
    RAISE NOTICE 'Backup already exists: customer_address_history_backup — leaving as-is';
  END IF;
END $$;

-- 2. Report before.
DO $$
BEGIN
  RAISE NOTICE 'Before cleanup: % total history rows',
    (SELECT count(*) FROM public.customer_address_history);
END $$;

-- 3. Delete redundant UPDATE churn.
WITH ordered AS (
  SELECT
    id,
    address_id,
    change_type,
    (address_snapshot - 'updated_at' - 'last_used_at' - 'is_last_used' - 'order_count') AS snap,
    lag(address_snapshot - 'updated_at' - 'last_used_at' - 'is_last_used' - 'order_count')
      OVER (PARTITION BY address_id ORDER BY created_at, id) AS prev_snap,
    row_number()
      OVER (PARTITION BY address_id ORDER BY created_at DESC, id DESC) AS rn_latest
  FROM public.customer_address_history
)
DELETE FROM public.customer_address_history h
USING ordered o
WHERE h.id = o.id
  AND o.change_type = 'UPDATE'          -- only UPDATE rows are candidates
  AND o.rn_latest > 1                   -- never delete the newest row per address
  AND o.snap IS NOT DISTINCT FROM o.prev_snap;  -- identical substance to predecessor → churn

-- 4. Report after.
DO $$
BEGIN
  RAISE NOTICE 'After cleanup:  % total history rows (backup retains the originals)',
    (SELECT count(*) FROM public.customer_address_history);
END $$;

COMMIT;

-- To undo before you drop the backup:
--   INSERT INTO customer_address_history
--   SELECT * FROM customer_address_history_backup b
--   WHERE NOT EXISTS (SELECT 1 FROM customer_address_history h WHERE h.id = b.id);
-- Once verified, drop the backup:
--   DROP TABLE customer_address_history_backup;
