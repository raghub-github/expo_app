-- Rollback for 0635: does NOT drop classic_* columns (safe — 0634 owns those).
-- No data restore: intentional detach of ₹99 from grid cannot be reversed
-- without a backup. This file exists so apply scripts that look for
-- *_rollback.sql find a no-op companion.

SELECT 1;
