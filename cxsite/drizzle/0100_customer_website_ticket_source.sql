-- Migration: customer website support form tickets
-- 1) Add unified_ticket_source value CUSTOMER_WEBSITE
-- 2) Extend raised_by check so guest web forms can open tickets with name + email
--    (same pattern as rider pre-login in backend/drizzle/0270_rider_prelogin_tickets.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unified_ticket_source'
      AND e.enumlabel = 'CUSTOMER_WEBSITE'
  ) THEN
    ALTER TYPE unified_ticket_source ADD VALUE 'CUSTOMER_WEBSITE';
  END IF;
END $$;
