-- ============================================================================
-- 0064: Add 'ALL' to service_type enum for blacklist "all services"
-- (Some DBs have service_type from 0010 with only FOOD, PARCEL, RIDE)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'service_type' AND e.enumlabel = 'ALL'
  ) THEN
    ALTER TYPE service_type ADD VALUE 'ALL';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- service_type enum may not exist yet (e.g. 0061 creates it with 'all' lowercase)
END $$;
