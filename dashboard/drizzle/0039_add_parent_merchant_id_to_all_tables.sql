-- ============================================================================
-- ADD PARENT_MERCHANT_ID TO ALL MERCHANT-RELATED TABLES
-- Migration: 0039_add_parent_merchant_id_to_all_tables
-- Database: Supabase PostgreSQL
-- 
-- This migration adds parent_merchant_id (TEXT) column to all tables that
-- have a foreign key reference to merchant_parents.id, allowing easy access
-- to the human-readable parent merchant identifier without joins.
-- ============================================================================

-- ============================================================================
-- STEP 1: ADD COLUMN TO MERCHANT_STORES
-- ============================================================================

-- Add parent_merchant_id column
ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

-- Populate existing data
UPDATE merchant_stores ms
SET parent_merchant_id = mp.parent_merchant_id
FROM merchant_parents mp
WHERE ms.parent_id = mp.id
  AND ms.parent_merchant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS merchant_stores_parent_merchant_id_idx 
  ON merchant_stores(parent_merchant_id);

-- ============================================================================
-- STEP 2: ADD COLUMN TO MERCHANT_COUPONS
-- ============================================================================

-- Add parent_merchant_id column
ALTER TABLE merchant_coupons
  ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

-- Populate existing data
UPDATE merchant_coupons mc
SET parent_merchant_id = mp.parent_merchant_id
FROM merchant_parents mp
WHERE mc.parent_id = mp.id
  AND mc.parent_merchant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS merchant_coupons_parent_merchant_id_idx 
  ON merchant_coupons(parent_merchant_id);

-- ============================================================================
-- STEP 3: ADD COLUMN TO MERCHANT_STORE_COMMISSION_RULES
-- ============================================================================

-- Add parent_merchant_id column
ALTER TABLE merchant_store_commission_rules
  ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

-- Populate existing data
UPDATE merchant_store_commission_rules mscr
SET parent_merchant_id = mp.parent_merchant_id
FROM merchant_parents mp
WHERE mscr.parent_id = mp.id
  AND mscr.parent_merchant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_parent_merchant_id_idx 
  ON merchant_store_commission_rules(parent_merchant_id);

-- ============================================================================
-- STEP 4: ADD COLUMN TO MERCHANT_STORE_PAYOUTS
-- ============================================================================

-- Add parent_merchant_id column
ALTER TABLE merchant_store_payouts
  ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

-- Populate existing data
UPDATE merchant_store_payouts msp
SET parent_merchant_id = mp.parent_merchant_id
FROM merchant_parents mp
WHERE msp.parent_id = mp.id
  AND msp.parent_merchant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS merchant_store_payouts_parent_merchant_id_idx 
  ON merchant_store_payouts(parent_merchant_id);

-- ============================================================================
-- STEP 5: ADD COLUMN TO MERCHANT_USERS
-- ============================================================================

-- Add parent_merchant_id column
ALTER TABLE merchant_users
  ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

-- Populate existing data
UPDATE merchant_users mu
SET parent_merchant_id = mp.parent_merchant_id
FROM merchant_parents mp
WHERE mu.parent_id = mp.id
  AND mu.parent_merchant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS merchant_users_parent_merchant_id_idx 
  ON merchant_users(parent_merchant_id);

-- ============================================================================
-- STEP 6: ADD COLUMN TO ORDERS (if merchant_parent_id exists)
-- ============================================================================

DO $$
BEGIN
  -- Check if orders table has merchant_parent_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
    AND column_name = 'merchant_parent_id'
  ) THEN
    -- Add parent_merchant_id column
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

    -- Populate existing data
    UPDATE orders o
    SET parent_merchant_id = mp.parent_merchant_id
    FROM merchant_parents mp
    WHERE o.merchant_parent_id = mp.id
      AND o.parent_merchant_id IS NULL;

    -- Add index
    CREATE INDEX IF NOT EXISTS orders_parent_merchant_id_idx 
      ON orders(parent_merchant_id);
  END IF;
END $$;

-- ============================================================================
-- STEP 7: ADD COLUMN TO TICKETS (if table exists)
-- ============================================================================

DO $$
BEGIN
  -- Check if tickets table exists and has merchant_parent_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'tickets'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' 
    AND column_name = 'merchant_parent_id'
  ) THEN
    -- Add parent_merchant_id column
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS parent_merchant_id TEXT;

    -- Populate existing data
    UPDATE tickets t
    SET parent_merchant_id = mp.parent_merchant_id
    FROM merchant_parents mp
    WHERE t.merchant_parent_id = mp.id
      AND t.parent_merchant_id IS NULL;

    -- Add index
    CREATE INDEX IF NOT EXISTS tickets_parent_merchant_id_idx 
      ON tickets(parent_merchant_id);
  END IF;
END $$;

-- ============================================================================
-- STEP 8: CREATE TRIGGER FUNCTIONS TO KEEP PARENT_MERCHANT_ID IN SYNC
-- ============================================================================

-- Function 8.1: Sync parent_merchant_id when parent_id changes in merchant_stores
CREATE OR REPLACE FUNCTION sync_merchant_stores_parent_merchant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_merchant_id INTO NEW.parent_merchant_id
    FROM merchant_parents
    WHERE id = NEW.parent_id;
  ELSE
    NEW.parent_merchant_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for merchant_stores
DROP TRIGGER IF EXISTS merchant_stores_sync_parent_merchant_id_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_sync_parent_merchant_id_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION sync_merchant_stores_parent_merchant_id();

-- Function 8.2: Sync parent_merchant_id when parent_id changes in merchant_coupons
CREATE OR REPLACE FUNCTION sync_merchant_coupons_parent_merchant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_merchant_id INTO NEW.parent_merchant_id
    FROM merchant_parents
    WHERE id = NEW.parent_id;
  ELSE
    NEW.parent_merchant_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for merchant_coupons
DROP TRIGGER IF EXISTS merchant_coupons_sync_parent_merchant_id_trigger ON merchant_coupons;
CREATE TRIGGER merchant_coupons_sync_parent_merchant_id_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON merchant_coupons
  FOR EACH ROW
  EXECUTE FUNCTION sync_merchant_coupons_parent_merchant_id();

-- Function 8.3: Sync parent_merchant_id when parent_id changes in merchant_store_commission_rules
CREATE OR REPLACE FUNCTION sync_merchant_store_commission_rules_parent_merchant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_merchant_id INTO NEW.parent_merchant_id
    FROM merchant_parents
    WHERE id = NEW.parent_id;
  ELSE
    NEW.parent_merchant_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for merchant_store_commission_rules
DROP TRIGGER IF EXISTS merchant_store_commission_rules_sync_parent_merchant_id_trigger ON merchant_store_commission_rules;
CREATE TRIGGER merchant_store_commission_rules_sync_parent_merchant_id_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON merchant_store_commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION sync_merchant_store_commission_rules_parent_merchant_id();

-- Function 8.4: Sync parent_merchant_id when parent_id changes in merchant_store_payouts
CREATE OR REPLACE FUNCTION sync_merchant_store_payouts_parent_merchant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_merchant_id INTO NEW.parent_merchant_id
    FROM merchant_parents
    WHERE id = NEW.parent_id;
  ELSE
    NEW.parent_merchant_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for merchant_store_payouts
DROP TRIGGER IF EXISTS merchant_store_payouts_sync_parent_merchant_id_trigger ON merchant_store_payouts;
CREATE TRIGGER merchant_store_payouts_sync_parent_merchant_id_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON merchant_store_payouts
  FOR EACH ROW
  EXECUTE FUNCTION sync_merchant_store_payouts_parent_merchant_id();

-- Function 8.5: Sync parent_merchant_id when parent_id changes in merchant_users
CREATE OR REPLACE FUNCTION sync_merchant_users_parent_merchant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_merchant_id INTO NEW.parent_merchant_id
    FROM merchant_parents
    WHERE id = NEW.parent_id;
  ELSE
    NEW.parent_merchant_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for merchant_users
DROP TRIGGER IF EXISTS merchant_users_sync_parent_merchant_id_trigger ON merchant_users;
CREATE TRIGGER merchant_users_sync_parent_merchant_id_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON merchant_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_merchant_users_parent_merchant_id();

-- Function 8.6: Sync parent_merchant_id when merchant_parent_id changes in orders
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
    AND column_name = 'merchant_parent_id'
  ) THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION sync_orders_parent_merchant_id()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.merchant_parent_id IS NOT NULL THEN
        SELECT parent_merchant_id INTO NEW.parent_merchant_id
        FROM merchant_parents
        WHERE id = NEW.merchant_parent_id;
      ELSE
        NEW.parent_merchant_id := NULL;
      END IF;
      
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS orders_sync_parent_merchant_id_trigger ON orders;
    CREATE TRIGGER orders_sync_parent_merchant_id_trigger
      BEFORE INSERT OR UPDATE OF merchant_parent_id ON orders
      FOR EACH ROW
      EXECUTE FUNCTION sync_orders_parent_merchant_id();
    ';
  END IF;
END $$;

-- Function 8.7: Sync parent_merchant_id when merchant_parent_id changes in tickets
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'tickets'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' 
    AND column_name = 'merchant_parent_id'
  ) THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION sync_tickets_parent_merchant_id()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.merchant_parent_id IS NOT NULL THEN
        SELECT parent_merchant_id INTO NEW.parent_merchant_id
        FROM merchant_parents
        WHERE id = NEW.merchant_parent_id;
      ELSE
        NEW.parent_merchant_id := NULL;
      END IF;
      
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tickets_sync_parent_merchant_id_trigger ON tickets;
    CREATE TRIGGER tickets_sync_parent_merchant_id_trigger
      BEFORE INSERT OR UPDATE OF merchant_parent_id ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION sync_tickets_parent_merchant_id();
    ';
  END IF;
END $$;

-- ============================================================================
-- STEP 9: CREATE TRIGGER TO UPDATE CHILD TABLES WHEN PARENT_MERCHANT_ID CHANGES
-- ============================================================================

-- Function 9.1: Update all child tables when merchant_parents.parent_merchant_id changes
CREATE OR REPLACE FUNCTION cascade_parent_merchant_id_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if parent_merchant_id actually changed
  IF OLD.parent_merchant_id IS DISTINCT FROM NEW.parent_merchant_id THEN
    -- Update merchant_stores
    UPDATE merchant_stores
    SET parent_merchant_id = NEW.parent_merchant_id
    WHERE parent_id = NEW.id;
    
    -- Update merchant_coupons
    UPDATE merchant_coupons
    SET parent_merchant_id = NEW.parent_merchant_id
    WHERE parent_id = NEW.id;
    
    -- Update merchant_store_commission_rules
    UPDATE merchant_store_commission_rules
    SET parent_merchant_id = NEW.parent_merchant_id
    WHERE parent_id = NEW.id;
    
    -- Update merchant_store_payouts
    UPDATE merchant_store_payouts
    SET parent_merchant_id = NEW.parent_merchant_id
    WHERE parent_id = NEW.id;
    
    -- Update merchant_users
    UPDATE merchant_users
    SET parent_merchant_id = NEW.parent_merchant_id
    WHERE parent_id = NEW.id;
    
    -- Update orders (if column exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'merchant_parent_id'
    ) THEN
      UPDATE orders
      SET parent_merchant_id = NEW.parent_merchant_id
      WHERE merchant_parent_id = NEW.id;
    END IF;
    
    -- Update tickets (if table and column exist)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'tickets'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tickets' 
      AND column_name = 'merchant_parent_id'
    ) THEN
      UPDATE tickets
      SET parent_merchant_id = NEW.parent_merchant_id
      WHERE merchant_parent_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on merchant_parents
DROP TRIGGER IF EXISTS merchant_parents_cascade_parent_merchant_id_trigger ON merchant_parents;
CREATE TRIGGER merchant_parents_cascade_parent_merchant_id_trigger
  AFTER UPDATE OF parent_merchant_id ON merchant_parents
  FOR EACH ROW
  WHEN (OLD.parent_merchant_id IS DISTINCT FROM NEW.parent_merchant_id)
  EXECUTE FUNCTION cascade_parent_merchant_id_update();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN merchant_stores.parent_merchant_id IS 'Denormalized parent merchant identifier (TEXT) for easy access without joins. Auto-synced with merchant_parents.parent_merchant_id.';
COMMENT ON COLUMN merchant_coupons.parent_merchant_id IS 'Denormalized parent merchant identifier (TEXT) for easy access without joins. Auto-synced with merchant_parents.parent_merchant_id.';
COMMENT ON COLUMN merchant_store_commission_rules.parent_merchant_id IS 'Denormalized parent merchant identifier (TEXT) for easy access without joins. Auto-synced with merchant_parents.parent_merchant_id.';
COMMENT ON COLUMN merchant_store_payouts.parent_merchant_id IS 'Denormalized parent merchant identifier (TEXT) for easy access without joins. Auto-synced with merchant_parents.parent_merchant_id.';
COMMENT ON COLUMN merchant_users.parent_merchant_id IS 'Denormalized parent merchant identifier (TEXT) for easy access without joins. Auto-synced with merchant_parents.parent_merchant_id.';
COMMENT ON FUNCTION cascade_parent_merchant_id_update() IS 'Automatically updates parent_merchant_id in all child tables when merchant_parents.parent_merchant_id changes';
