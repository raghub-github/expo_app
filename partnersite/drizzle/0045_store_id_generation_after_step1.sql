-- Migration: Store ID Generation After Step 1
-- This migration ensures Store ID is generated and saved after completing step 1
-- and all subsequent operations use the database-stored Store ID

-- Update the merchant_store_registration_progress table to properly handle Store ID generation
-- The store_id column should be populated when a user completes step 1

-- Add index for better performance when querying by store_id
CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_store_id_status_idx 
ON public.merchant_store_registration_progress USING btree (store_id, registration_status) 
TABLESPACE pg_default;

-- Update the unique constraint to ensure only one active draft per parent
-- This replaces the existing constraint to be more specific
DROP INDEX IF EXISTS merchant_store_registration_progress_parent_single_active_draft;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_single_active_draft 
ON public.merchant_store_registration_progress USING btree (parent_id) 
TABLESPACE pg_default
WHERE (
  (store_id IS NULL) 
  AND (registration_status = ANY (ARRAY['IN_PROGRESS'::text, 'DRAFT'::text]))
);

-- Add a function to generate unique Store IDs
CREATE OR REPLACE FUNCTION generate_unique_store_id()
RETURNS TEXT AS $$
DECLARE
    max_num INTEGER := 1000;
    new_store_id TEXT;
    store_record RECORD;
BEGIN
    -- Find the highest numeric part of existing store_ids
    FOR store_record IN 
        SELECT store_id FROM merchant_stores 
        WHERE store_id ~ '^GMMC[0-9]+$'
    LOOP
        -- Extract numeric part and update max_num if higher
        max_num := GREATEST(max_num, CAST(SUBSTRING(store_record.store_id FROM 5) AS INTEGER));
    END LOOP;
    
    -- Also check merchant_store_registration_progress table for any pending Store IDs
    FOR store_record IN 
        SELECT form_data->'step_store'->>'storePublicId' as store_id 
        FROM merchant_store_registration_progress 
        WHERE form_data->'step_store'->>'storePublicId' ~ '^GMMC[0-9]+$'
    LOOP
        -- Extract numeric part and update max_num if higher
        max_num := GREATEST(max_num, CAST(SUBSTRING(store_record.store_id FROM 5) AS INTEGER));
    END LOOP;
    
    -- Generate new Store ID
    new_store_id := 'GMMC' || (max_num + 1)::TEXT;
    
    RETURN new_store_id;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger function to automatically populate store_id in merchant_stores when created from progress
CREATE OR REPLACE FUNCTION sync_store_id_from_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- If store_id is being set in the progress table and there's a linked merchant_stores record
    IF NEW.store_id IS NOT NULL AND OLD.store_id IS NULL THEN
        -- Update any linked merchant_stores record to have the same store_id
        UPDATE merchant_stores 
        SET store_id = NEW.store_id
        WHERE id = (NEW.form_data->'step_store'->>'storeDbId')::bigint
        AND store_id IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_store_id_trigger ON merchant_store_registration_progress;
CREATE TRIGGER sync_store_id_trigger
    AFTER UPDATE ON merchant_store_registration_progress
    FOR EACH ROW
    EXECUTE FUNCTION sync_store_id_from_progress();

-- Update any existing records that might need store_id population
-- This is a one-time cleanup for existing data
UPDATE merchant_store_registration_progress 
SET store_id = (
    SELECT ms.id 
    FROM merchant_stores ms 
    WHERE ms.id = (form_data->'step_store'->>'storeDbId')::bigint
    LIMIT 1
)
WHERE store_id IS NULL 
AND form_data->'step_store'->>'storeDbId' IS NOT NULL
AND (form_data->'step_store'->>'storeDbId')::text ~ '^[0-9]+$';

-- Add comments for documentation
COMMENT ON FUNCTION generate_unique_store_id() IS 'Generates a unique Store ID in format GMMC{number} by finding the highest existing number and incrementing it';
COMMENT ON FUNCTION sync_store_id_from_progress() IS 'Syncs store_id between merchant_store_registration_progress and merchant_stores tables';
COMMENT ON INDEX merchant_store_registration_progress_store_id_status_idx IS 'Index for efficient querying by store_id and registration_status';