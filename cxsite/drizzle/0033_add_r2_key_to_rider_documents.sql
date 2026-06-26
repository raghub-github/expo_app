-- Migration: Add r2_key column to rider_documents table
-- Purpose: Store R2 storage key separately to allow URL regeneration when signed URLs expire
-- Date: 2024

-- Add r2_key column (nullable for existing records)
ALTER TABLE "rider_documents" 
ADD COLUMN IF NOT EXISTS "r2_key" TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN "rider_documents"."r2_key" IS 'R2 storage key for the file. Used to regenerate signed URLs when they expire. The file itself never expires, only the signed URL.';
