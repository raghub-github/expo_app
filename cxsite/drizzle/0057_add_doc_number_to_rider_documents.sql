-- Migration: Add doc_number column to rider_documents table
-- This allows storing document identification numbers (DL number, RC number, etc.)
-- Migration: 0057_add_doc_number_to_rider_documents

-- Add doc_number column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rider_documents' 
        AND column_name = 'doc_number'
    ) THEN
        ALTER TABLE rider_documents
        ADD COLUMN doc_number TEXT;
        
        -- Add index for efficient queries on document numbers
        CREATE INDEX IF NOT EXISTS rider_documents_doc_number_idx 
        ON rider_documents(doc_number) 
        WHERE doc_number IS NOT NULL;
        
        -- Add comment
        COMMENT ON COLUMN rider_documents.doc_number IS 
        'Document identification number (e.g., DL number, RC number, etc.). Stored separately from document image for manual verification and editing.';
    END IF;
END $$;
