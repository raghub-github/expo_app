-- 1. Create store_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_status') THEN
        CREATE TYPE public.store_status AS ENUM ('ACTIVE', 'INACTIVE');
    END IF;
END$$;

-- 2. Create store_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_type') THEN
        CREATE TYPE public.store_type AS ENUM ('RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN', 'GROCERY', 'PHARMA', 'STATIONERY', 'OTHERS');
    END IF;
END$$;

-- 3. Create store_operational_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_operational_status') THEN
        CREATE TYPE public.store_operational_status AS ENUM ('OPEN', 'INACTIVE');
    END IF;
END$$;

-- 4. Create store_approval_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_approval_status') THEN
        CREATE TYPE public.store_approval_status AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'BLOCKED', 'DELISTED', 'SUSPENDED');
    END IF;
END$$;

-- 5. Enforce store_status rules via trigger
-- This trigger ensures status is INACTIVE by default and only becomes ACTIVE when approval_status is APPROVED
CREATE OR REPLACE FUNCTION enforce_store_status_rule() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.approval_status = 'APPROVED' THEN
        NEW.status := 'ACTIVE';
    ELSE
        NEW.status := 'INACTIVE';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS merchant_stores_enforce_status_rule ON public.merchant_stores;

-- Create trigger for INSERT and UPDATE of approval_status
CREATE TRIGGER merchant_stores_enforce_status_rule
BEFORE INSERT OR UPDATE OF approval_status ON public.merchant_stores
FOR EACH ROW EXECUTE FUNCTION enforce_store_status_rule();

-- 6. Ensure store_operational_status is UI-managed only (no triggers or sync logic)
-- No automatic logic applied to store_operational_status
-- Manual control only

-- 7. Ensure status defaults to INACTIVE
ALTER TABLE public.merchant_stores ALTER COLUMN status SET DEFAULT 'INACTIVE';
