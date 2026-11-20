-- Migration: customer website support form tickets
-- Adds unified_ticket_source value for gatimitra.com / cxsite /support submissions.
-- Display label: "Customer Website"; DB enum: CUSTOMER_WEBSITE.
-- Mirror of cxsite/drizzle/0100_customer_website_ticket_source.sql

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
