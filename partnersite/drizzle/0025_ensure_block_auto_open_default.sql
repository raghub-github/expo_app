-- Ensure block_auto_open defaults to false and update existing NULL values
-- This migration ensures the Manual Activation Lock toggle works properly with default OFF state

-- 1. Update any existing NULL values to false
UPDATE public.merchant_store_availability
SET block_auto_open = false
WHERE block_auto_open IS NULL;

-- 2. Ensure the column has a NOT NULL constraint with DEFAULT false
-- First, drop the existing column if it exists without proper default
DO $$
BEGIN
  -- Check if column exists and doesn't have NOT NULL constraint
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_availability'
      AND column_name = 'block_auto_open'
      AND is_nullable = 'YES'
  ) THEN
    -- Alter column to set NOT NULL with default
    ALTER TABLE public.merchant_store_availability
      ALTER COLUMN block_auto_open SET DEFAULT false,
      ALTER COLUMN block_auto_open SET NOT NULL;
  ELSE
    -- If column doesn't exist, add it with proper default
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'merchant_store_availability'
        AND column_name = 'block_auto_open'
    ) THEN
      ALTER TABLE public.merchant_store_availability
        ADD COLUMN block_auto_open boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;

-- 3. Add comment for documentation
COMMENT ON COLUMN public.merchant_store_availability.block_auto_open IS 
  'When true, store must NOT auto-open on schedule; only manual turn ON opens. Default: false (OFF)';

-- 4. Create index for efficient queries (optional but recommended)
CREATE INDEX IF NOT EXISTS merchant_store_availability_block_auto_open_idx 
  ON public.merchant_store_availability(store_id) 
  WHERE block_auto_open = true;
