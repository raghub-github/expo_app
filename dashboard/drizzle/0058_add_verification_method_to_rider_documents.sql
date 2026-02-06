-- Migration: Add verification_method column to rider_documents table
-- This distinguishes between app-verified documents (OTP, etc.) and manually uploaded documents
-- Migration: 0058_add_verification_method_to_rider_documents
--
-- IMPORTANT NOTES:
-- 1. file_url is NOT NULL in the database, so APP_VERIFIED documents must use a placeholder value
--    (e.g., empty string '' or a special URL like 'app-verified://placeholder')
-- 2. APP_VERIFIED documents will have r2_key = NULL (no image stored in R2)
-- 3. All existing documents will default to 'MANUAL_UPLOAD' (safe for existing data)

-- Create enum for verification method
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method') THEN
        CREATE TYPE verification_method AS ENUM ('APP_VERIFIED', 'MANUAL_UPLOAD');
    END IF;
END $$;

-- Add verification_method column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rider_documents' 
        AND column_name = 'verification_method'
    ) THEN
        ALTER TABLE rider_documents
        ADD COLUMN verification_method verification_method NOT NULL DEFAULT 'MANUAL_UPLOAD';
        
        -- Add index for efficient queries on verification method
        CREATE INDEX IF NOT EXISTS rider_documents_verification_method_idx 
        ON rider_documents(verification_method);
        
        -- Add comment
        COMMENT ON COLUMN rider_documents.verification_method IS 
        'Verification method: APP_VERIFIED (verified through app via OTP, etc.) or MANUAL_UPLOAD (rider uploaded image manually). APP_VERIFIED documents may not have images stored - file_url should be a placeholder value.';
    END IF;
END $$;
