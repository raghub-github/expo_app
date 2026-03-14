-- One-time data migration: clear manual-close cache on the table connected to the
-- store open/close toggle so status reason shows correctly (schedule_closed /
-- outside_operating_hours instead of manual_close when store was closed by schedule).
UPDATE merchant_store_availability
SET manual_close_until = NULL,
    close_reason = NULL,
    updated_at = NOW()
WHERE manual_close_until IS NOT NULL
   OR close_reason IS NOT NULL;
